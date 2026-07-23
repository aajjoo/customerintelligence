// Monatsbericht (Etappe 5, Konzept 4.2): Claude erzeugt je Kunde einen Bericht aus
// den Daten des Monats – Executive Summary, wichtigste Signale je Dimension,
// Opportunities, Projekt-/KPI-Teil, Entwicklung gegenüber dem Vormonat sowie
// empfohlene Maßnahmen, die bei Freigabe zu Aufgaben werden.
// Kernregel 1: Signal-Aussagen tragen die Quellenangabe aus dem Radar.
import Anthropic from "@anthropic-ai/sdk";
import { getAreaInstruction, instructionBlock } from "@/lib/areaSkills";
import { db } from "@/lib/db";
import { buildReportInput, type ReportBody } from "./input.ts";

export type { ReportBody, ReportSection, SuggestedTask } from "./input.ts";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";

const REPORT_SCHEMA = {
  type: "object",
  properties: {
    execSummary: {
      type: "string",
      description:
        "Executive Summary, 3-5 Sätze: prägende Entwicklungen des Monats, Lage, Empfehlung",
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          text: { type: "string", description: "Fließtext, Signal-Aussagen mit (Quelle: …)" },
        },
        required: ["title", "text"],
        additionalProperties: false,
      },
      description:
        "Genau diese Abschnitte in dieser Reihenfolge: 'Wichtigste Signale', 'Projekte & KPIs', 'Opportunities & Aufgaben', 'Entwicklung gegenüber dem Vormonat'",
    },
    suggestedTasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Konkrete Maßnahme, imperativ formuliert" },
          dueInDays: { type: "integer", description: "Fälligkeit in Tagen ab Freigabe (7-30)" },
          reason: { type: "string", description: "Begründung mit Bezug auf Signal/KPI/Opportunity" },
        },
        required: ["title", "dueInDays", "reason"],
        additionalProperties: false,
      },
      description: "2-4 empfohlene Maßnahmen; nur wenn fachlich begründbar, sonst leer",
    },
  },
  required: ["execSummary", "sections", "suggestedTasks"],
  additionalProperties: false,
} as const;

/** Generiert (oder ersetzt) den Bericht eines Kunden für den Monat. */
export async function generateReport(customerId: string, month: string): Promise<{ id: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt – Berichtgenerierung nicht möglich");
  }

  // Freigegebene Berichte sind archiviert und werden nicht überschrieben (Konzept 4.2)
  const existing = await db.report.findUnique({
    where: { customerId_month: { customerId, month } },
  });
  if (existing?.status === "approved") {
    throw new Error(`Der Bericht ${month} ist bereits freigegeben und archiviert`);
  }

  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);
  const prevMonth = `${new Date(y, m - 2, 1).getFullYear()}-${String(new Date(y, m - 2, 1).getMonth() + 1).padStart(2, "0")}`;

  const customer = await db.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: {
      signals: { where: { occurredAt: { gte: monthStart, lt: monthEnd } } },
      projects: { include: { kpis: { include: { values: { orderBy: { period: "asc" } } } } } },
      opportunities: { where: { stage: { not: "dropped" } } },
      tasks: true,
      reports: { where: { month: prevMonth } },
    },
  });

  const now = new Date();
  const input = buildReportInput({
    name: customer.name,
    month,
    signals: customer.signals,
    projects: customer.projects.map((p) => ({
      name: p.name,
      status: p.status,
      phase: p.phase,
      kpis: p.kpis.map((k) => ({
        label: k.label,
        unit: k.unit,
        values: k.values.map((v) => v.value),
        target: k.target,
        threshold: k.threshold,
      })),
    })),
    opportunities: customer.opportunities,
    tasks: customer.tasks.map((t) => ({
      title: t.title,
      status: t.status,
      overdue: !!t.dueAt && t.dueAt < now && t.status === "open",
    })),
    prevExecSummary: customer.reports[0]?.execSummary ?? null,
  });

  // Bereichs-Skill "bericht": Team-Anweisungen für die Generierung
  const teamInstruction = instructionBlock(await getAreaInstruction("bericht"));

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "Du bist die Berichtgenerierung des Netural Marktradars. Du erstellst präzise, belegte Monatsberichte für Kundenteams und antwortest ausschließlich mit dem geforderten JSON.",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: REPORT_SCHEMA },
    },
    messages: [{ role: "user", content: input + teamInstruction }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude hat die Berichtgenerierung abgelehnt (refusal)");
  }
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as { execSummary: string } & ReportBody;

  const body: ReportBody = {
    sections: parsed.sections,
    suggestedTasks: parsed.suggestedTasks,
  };

  // Neu generieren ersetzt den Entwurf; freigegebene Berichte sind archiviert und bleiben
  const report = await db.report.upsert({
    where: { customerId_month: { customerId, month } },
    create: {
      customerId,
      month,
      execSummary: parsed.execSummary,
      bodyJson: JSON.stringify(body),
    },
    update: {
      execSummary: parsed.execSummary,
      bodyJson: JSON.stringify(body),
      status: "draft",
      approvedAt: null,
    },
  });
  return { id: report.id };
}
