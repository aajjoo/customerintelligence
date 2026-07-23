// Relevanzbewertung + Zusammenfassung DE (Konzept Kap. 9):
// Claude bewertet jedes Item gegen zwei Referenzen – das Kundenprofil und das
// Netural-Leistungsportfolio – ordnet eine Radar-Dimension zu und fasst deutsch zusammen.
// Verarbeitung gebatcht (Kostenkontrolle); strukturierte Outputs garantieren valides JSON.
import Anthropic from "@anthropic-ai/sdk";
import type { CustomerProfile, RawItem, ScoredItem } from "./types";

// SCORING_MODEL erlaubt ein schnelleres Modell nur fürs Signal-Scoring
// (z. B. claude-haiku-4-5), ohne Bericht/Chat/Workflows umzustellen.
const MODEL =
  process.env.SCORING_MODEL ?? process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
const BATCH_SIZE = 10;

/** Zentral gepflegtes Netural-Leistungsportfolio (Referenz laut Konzept Kap. 3.2). */
export const NETURAL_PORTFOLIO = `Netural ist eine Digitalagentur mit diesen Leistungsfeldern:
- Analyse & Strategie: Digitalstrategie, Anforderungsanalyse, Prozessdigitalisierung
- Experience Design: UX/UI, Service Design, Design-Systeme
- Software Engineering: Portale, Plattformen, Apps, Integrationen, E-Commerce
- Daten & KI: Datenplattformen, Analytics, KI-Anwendungen und -Integration`;

const SCORING_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "Index des Items aus der Eingabe" },
          relevance: {
            type: "integer",
            description: "Relevanz 0-100 für Kunde UND Netural-Anknüpfung",
          },
          dimension: {
            type: "string",
            enum: ["markt", "kunde", "mitbewerb", "innovation", "geschaeft", "politik"],
          },
          titleDe: { type: "string", description: "Prägnanter deutscher Titel" },
          summaryDe: {
            type: "string",
            description:
              "2-3 Sätze deutsch: was ist passiert und warum ist es für Kunde/Netural relevant",
          },
        },
        required: ["index", "relevance", "dimension", "titleDe", "summaryDe"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

/** Optionale Team-Vorgaben (Bereichs-Skills), vom Orchestrator geladen. */
export type ScoringExtras = {
  /** Ersetzt das eingebaute Leistungsportfolio (Bereichs-Skill "leistungsportfolio") */
  portfolio?: string | null;
  /** Zusätzliche Scoring-Anweisungen des Teams (Bereichs-Skill "scoring") */
  instruction?: string | null;
};

/** Baut den Bewertungs-Prompt für einen Batch (rein, getestet). */
export function buildScoringPrompt(
  profile: CustomerProfile,
  items: RawItem[],
  instruction?: string | null
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

  const itemsBlock = items
    .map(
      (item, i) =>
        `[${i}] ${item.title}\n${item.excerpt ? `Auszug: ${item.excerpt}\n` : ""}${
          item.url ? `URL: ${item.url}` : ""
        }`
    )
    .join("\n\n");

  return `Bewerte die folgenden Meldungen für das Kundenteam.

## Kundenprofil
${profileBlock}

## Meldungen
${itemsBlock}

Bewerte jede Meldung:
- relevance: 0-100. Hoch (80+) nur, wenn die Meldung den Kunden direkt betrifft UND Netural daran anknüpfen kann. Mittel (50-79) bei klarem Kunden- oder Branchenbezug. Niedrig (<50) bei allgemeinen Nachrichten ohne Bezug.
- dimension: markt (Markt & Branche), kunde (Kunde direkt), mitbewerb, innovation, geschaeft (Geschäftsebene: Zahlen, Personalien, Strategie), politik (Politik & Regulatorik).
- titleDe und summaryDe auf Deutsch; die Zusammenfassung nennt den Bezug zum Kunden oder zu Netural-Leistungen, wenn vorhanden. Keine Aussagen erfinden, die nicht in der Meldung stehen.${
    instruction ? `\n\n## Zusätzliche Anweisungen des Teams (verbindlich)\n${instruction}` : ""
  }`;
}

/** System-Prompt: stabile Referenz (cachebar); Portfolio überschreibbar per Bereichs-Skill. */
export function buildScoringSystemPrompt(portfolio?: string | null): string {
  return `Du bist die Bewertungs-Pipeline des Netural Marktradars, einer Kundenintelligenz-Plattform. Du bewertest externe Meldungen auf Relevanz für einen Agenturkunden und für das Leistungsportfolio von Netural. Du antwortest ausschließlich mit dem geforderten JSON.

${portfolio?.trim() || NETURAL_PORTFOLIO}`;
}

export type Scorer = (profile: CustomerProfile, items: RawItem[]) => Promise<ScoredItem[]>;

/** Erzeugt den Claude-Scorer; Team-Vorgaben (Bereichs-Skills) kommen vom Orchestrator. */
export function createClaudeScorer(extras?: ScoringExtras): Scorer {
  return async (profile, items) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY ist nicht gesetzt – Claude-Scoring nicht möglich (Kernregel: keine unbewertete Ausspielung)"
    );
  }
  const client = new Anthropic();
  const scored: ScoredItem[] = [];

  for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
    const batch = items.slice(offset, offset + BATCH_SIZE);
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: buildScoringSystemPrompt(extras?.portfolio),
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        // Klassifikation + Kurzzusammenfassung ist mechanisch: low ist deutlich
        // schneller bei praktisch gleicher Qualität (Performance-Feedback)
        effort: "low",
        format: { type: "json_schema", schema: SCORING_SCHEMA },
      },
      messages: [
        { role: "user", content: buildScoringPrompt(profile, batch, extras?.instruction) },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Claude hat die Bewertung abgelehnt (refusal)");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Scoring-Antwort abgeschnitten (max_tokens) – Batch verkleinern");
    }

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    scored.push(...parseScoringResponse(text, batch));
  }
  return scored;
  };
}

/** Mappt die (schema-validierte) Antwort zurück auf die Items (rein, getestet). */
export function parseScoringResponse(json: string, batch: RawItem[]): ScoredItem[] {
  const parsed = JSON.parse(json) as {
    items: { index: number; relevance: number; dimension: string; titleDe: string; summaryDe: string }[];
  };
  const out: ScoredItem[] = [];
  for (const s of parsed.items) {
    const item = batch[s.index];
    if (!item) continue; // Index außerhalb des Batches → ignorieren
    out.push({
      ...item,
      relevance: Math.max(0, Math.min(100, s.relevance)),
      dimension: s.dimension,
      titleDe: s.titleDe,
      summaryDe: s.summaryDe,
    });
  }
  return out;
}
