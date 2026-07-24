// Projekt-Einschätzung (Feedback-Runde 2, Konzept 5): Claude bewertet aus
// Ticket-Entwicklung, Jira-Inhalten, Confluence-Auszügen und Stundenstand,
// ob das Projekt gesund ist und ob das DB-Ziel noch erreichbar scheint.
// Jede Aussage trägt Quellen (Issue-Keys/Seiten, Kernregel 1).
import Anthropic from "@anthropic-ai/sdk";
import type { ConfluenceExcerpt, IssueExcerpt, TicketStats } from "../integrations/jira.ts";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";

export type ProjectHealthInput = {
  projectName: string;
  customerName: string;
  phase: string | null;
  budgetHours: number | null;
  spentHours: number | null;
  dbTargetPct: number | null;
  stats: TicketStats | null;
  issues: IssueExcerpt[];
  pages: ConfluenceExcerpt[];
};

export type ProjectHealth = {
  status: "ok" | "watch" | "critical";
  summaryDe: string;
  problems: { titleDe: string; evidenceDe: string; source: string }[];
  dbAssessment: "on_track" | "at_risk" | "off_track" | "unknown";
  dbRationaleDe: string;
};

export const HEALTH_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "watch", "critical"] },
    summaryDe: { type: "string", description: "Lage in 2-3 Sätzen, deutsch" },
    problems: {
      type: "array",
      description: "Konkrete Probleme/Risiken, jeweils mit Beleg und Quelle",
      items: {
        type: "object",
        properties: {
          titleDe: { type: "string" },
          evidenceDe: { type: "string", description: "Woran erkennbar (1-2 Sätze)" },
          source: { type: "string", description: "Issue-Key, Confluence-Seite oder Kennzahl" },
        },
        required: ["titleDe", "evidenceDe", "source"],
        additionalProperties: false,
      },
    },
    dbAssessment: {
      type: "string",
      enum: ["on_track", "at_risk", "off_track", "unknown"],
      description: "Deckungsbeitrag: Ziel noch erreichbar?",
    },
    dbRationaleDe: { type: "string", description: "Begründung der DB-Einschätzung, deutsch" },
  },
  required: ["status", "summaryDe", "problems", "dbAssessment", "dbRationaleDe"],
  additionalProperties: false,
} as const;

/** Baut den Bewertungs-Prompt aus dem Projektmaterial (rein, getestet). */
export function buildHealthPrompt(input: ProjectHealthInput): string {
  const lines: string[] = [
    `# Projekt: ${input.projectName} (Kunde: ${input.customerName})`,
    input.phase ? `Phase: ${input.phase}` : "",
    "",
    "## Stunden & Budget",
    input.budgetHours != null
      ? `Budgetiert: ${input.budgetHours} h · Verbraucht: ${input.spentHours ?? "unbekannt"} h${
          input.spentHours != null
            ? ` (${Math.round((input.spentHours / input.budgetHours) * 100)} %)`
            : ""
        }`
      : `Kein Stundenbudget hinterlegt.${input.spentHours != null ? ` Verbraucht: ${input.spentHours} h` : ""}`,
    input.dbTargetPct != null ? `DB-Ziel: ${input.dbTargetPct} %` : "Kein DB-Ziel hinterlegt.",
  ];

  if (input.stats) {
    lines.push(
      "",
      "## Ticket-Entwicklung (Jira)",
      `Gesamt: ${input.stats.total} · offen: ${input.stats.open} · in Arbeit: ${input.stats.inProgress} · erledigt: ${input.stats.done}`,
      "Letzte 8 Wochen (angelegt/gelöst): " +
        input.stats.weeks.map((w) => `${w.week}: ${w.created}/${w.resolved}`).join(", ")
    );
  }

  if (input.issues.length) {
    lines.push("", "## Jüngste Tickets (mit letztem Kommentar)");
    for (const i of input.issues) {
      lines.push(
        `- [${i.key}] ${i.summary} (${i.status})${i.comment ? ` – Kommentar: ${i.comment}` : ""}`
      );
    }
  }

  if (input.pages.length) {
    lines.push("", "## Confluence-Auszüge");
    for (const p of input.pages) {
      lines.push(`- [${p.title}] ${p.excerpt}`);
    }
  }

  lines.push(
    "",
    "## Aufgabe",
    "Bewerte den Projektzustand NUR aus dem Material oben:",
    "1) status: ok / watch / critical (Ampel).",
    "2) summaryDe: Lage in 2-3 Sätzen.",
    "3) problems: konkrete Probleme oder Risiken (max. 5), je mit Beleg (evidenceDe) und Quelle (source = Issue-Key, Seitentitel oder Kennzahl wie 'Stundenstand'). Keine Probleme erfinden – wenn nichts erkennbar ist, leere Liste.",
    "4) dbAssessment: Ist das DB-Ziel noch erreichbar? on_track / at_risk / off_track; unknown wenn Stunden-/Budgetdaten fehlen. Faustregel: Stundenverbrauch deutlich über Projektfortschritt (erledigte vs. offene Tickets) gefährdet den DB.",
    "5) dbRationaleDe: Begründung in 1-2 Sätzen mit Zahlen aus dem Material."
  );

  return lines.filter((l) => l !== undefined).join("\n");
}

export const HEALTH_SYSTEM_PROMPT = `Du bist die Projekt-Analyse des Netural Marktradars. Du bewertest den Zustand von Agenturprojekten nüchtern und ausschließlich aus dem gelieferten Material (Jira-Tickets, Confluence-Auszüge, Stundenstand). Jede Problem-Aussage trägt eine Quelle. Du antwortest ausschließlich mit dem geforderten JSON.`;

/** Führt die Bewertung mit Claude aus (strukturierte Outputs). */
export async function runProjectHealth(input: ProjectHealthInput): Promise<ProjectHealth> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt");
  }
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [{ type: "text", text: HEALTH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: HEALTH_SCHEMA },
    },
    messages: [{ role: "user", content: buildHealthPrompt(input) }],
  });
  const text = [...response.content].reverse().find((b) => b.type === "text")?.text ?? "";
  return JSON.parse(text) as ProjectHealth;
}
