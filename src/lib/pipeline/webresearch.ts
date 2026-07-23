// Automatische Web-Recherche (Feedback-Runde 2): statt manuell gepflegter Feeds
// recherchiert Claude mit dem serverseitigen Web-Search-Tool aktiv im Netz –
// gesteuert über globale Recherche-Skills (scope="research"): Mitbewerber,
// Fachmedien, Plattformen, Stellenausschreibungen, Regulatorik, …
// Jedes Ergebnis trägt die gefundene URL als Quelle (Kernregel 1).
import Anthropic from "@anthropic-ai/sdk";
import type { CustomerProfile } from "./types.ts";

// Recherche braucht ein schnelles Modell: Opus + Websuche lief im Test ~15 Min.
// je Skill, Vercel-Functions haben aber maxDuration 300 s. Sonnet ist in 1-3 Min.
// fertig und für Suche+Zusammenfassung mehr als gut genug.
const MODEL = process.env.RESEARCH_MODEL ?? "claude-sonnet-5";
const MAX_SEARCHES_PER_SKILL = 5;
// Harte Grenze je Skill-Request, damit ein hängender Skill nicht den Lauf blockiert
const REQUEST_TIMEOUT_MS = 240_000;

export type ResearchSkill = { name: string; promptTmpl: string | null };

export type ResearchItem = {
  titleDe: string;
  summaryDe: string;
  url: string;
  sourceName: string; // z. B. "derstandard.at" oder "Pressemitteilung <Firma>"
  dimension: string;
  relevance: number;
};

export const RESEARCH_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titleDe: { type: "string", description: "Prägnanter deutscher Titel der Meldung" },
          summaryDe: {
            type: "string",
            description: "2-3 Sätze deutsch: was ist passiert, warum relevant für Kunde/Netural",
          },
          url: { type: "string", description: "URL der Fundstelle (aus der Websuche)" },
          sourceName: { type: "string", description: "Name der Quelle (Medium/Website)" },
          dimension: {
            type: "string",
            enum: ["markt", "kunde", "mitbewerb", "innovation", "geschaeft", "politik"],
          },
          relevance: { type: "integer", description: "Relevanz 0-100 für Kunde UND Netural" },
        },
        required: ["titleDe", "summaryDe", "url", "sourceName", "dimension", "relevance"],
        additionalProperties: false,
      },
      description: "Nur tatsächlich gefundene, belegte Meldungen; leer wenn nichts Relevantes",
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

/** Baut den Recherche-Prompt aus Skill + Kundenprofil (rein, getestet). */
export function buildResearchPrompt(
  skill: ResearchSkill,
  profile: CustomerProfile,
  days: number
): string {
  const profileBlock = [
    `Kunde: ${profile.name}`,
    `Branche: ${profile.industry}`,
    profile.markets ? `Märkte: ${profile.markets}` : null,
    profile.competitors.length ? `Mitbewerber: ${profile.competitors.join(", ")}` : null,
    profile.themes.length ? `Strategische Themen: ${profile.themes.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const instruction =
    skill.promptTmpl?.trim() ||
    `Recherchiere aktuelle Neuigkeiten im Bereich "${skill.name}" mit Relevanz für den Kunden.`;

  return `${instruction}

## Kundenprofil
${profileBlock}

## Vorgehen
- Nutze die Websuche (max. ${MAX_SEARCHES_PER_SKILL} Suchen), Fokus auf die letzten ${days} Tage; ältere Treffer nur bei hoher strategischer Relevanz.
- Suche bevorzugt deutschsprachig, ergänzend englisch.
- Nimm NUR Meldungen auf, die du tatsächlich gefunden hast – mit URL und Quellenname. Nichts erfinden.
- relevance: 80+ nur bei direktem Kundenbezug UND Netural-Anknüpfung; 50-79 klarer Kunden-/Branchenbezug; unter 50 weglassen.
- Maximal 6 Meldungen, die besten zuerst. Wenn nichts Relevantes: leere Liste.`;
}

export const RESEARCH_SYSTEM_PROMPT = `Du bist die Web-Recherche des Netural Marktradars, einer Kundenintelligenz-Plattform der Digitalagentur Netural. Du recherchierst aktiv im Web nach Neuigkeiten mit Relevanz für einen Agenturkunden und das Netural-Leistungsportfolio. Jede Meldung trägt URL und Quellenname; du erfindest nichts. Nach der Recherche antwortest du ausschließlich mit dem geforderten JSON.`;

/** Klemmt/validiert die Antwort-Items (rein, getestet). */
export function sanitizeResearchItems(items: ResearchItem[]): ResearchItem[] {
  const dims = ["markt", "kunde", "mitbewerb", "innovation", "geschaeft", "politik"];
  return items
    .filter((i) => i.titleDe?.trim() && i.url?.trim())
    .map((i) => ({
      ...i,
      relevance: Math.max(0, Math.min(100, Math.round(i.relevance ?? 0))),
      dimension: dims.includes(i.dimension) ? i.dimension : "markt",
      sourceName: i.sourceName?.trim() || new URL(i.url).hostname,
    }));
}

/**
 * Führt die Web-Recherche für einen Kunden über alle aktiven Recherche-Skills aus
 * (parallel). Fehler einzelner Skills werden gesammelt, nicht fatal.
 */
export async function runWebResearch(
  profile: CustomerProfile,
  skills: ResearchSkill[],
  options?: { days?: number; portfolio?: string | null }
): Promise<{ items: (ResearchItem & { skillName: string })[]; errors: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt – Web-Recherche nicht möglich");
  }
  const client = new Anthropic();
  const days = options?.days ?? 7;
  const errors: string[] = [];

  const results = await Promise.all(
    skills.map(async (skill) => {
      try {
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: [
            {
              type: "text",
              text:
                RESEARCH_SYSTEM_PROMPT +
                (options?.portfolio ? `\n\n${options.portfolio}` : ""),
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: MAX_SEARCHES_PER_SKILL,
            },
          ],
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: RESEARCH_SCHEMA },
          },
          messages: [{ role: "user", content: buildResearchPrompt(skill, profile, days) }],
        }, { timeout: REQUEST_TIMEOUT_MS });
        if (response.stop_reason === "refusal") {
          throw new Error("Recherche abgelehnt (refusal)");
        }
        // letzter Text-Block enthält das JSON (davor Such-Zwischenschritte)
        const text = [...response.content].reverse().find((b) => b.type === "text")?.text ?? "";
        const parsed = JSON.parse(text) as { items: ResearchItem[] };
        return sanitizeResearchItems(parsed.items).map((i) => ({ ...i, skillName: skill.name }));
      } catch (e) {
        errors.push(
          `Recherche „${skill.name}“: ${e instanceof Error ? e.message : String(e)}`
        );
        return [];
      }
    })
  );

  return { items: results.flat(), errors };
}
