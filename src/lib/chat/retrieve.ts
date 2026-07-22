// Chat-Retrieval (Etappe 6, Konzept 4.5): holt die für eine Frage relevanten
// Inhalte des Kunden – Signale, Berichte, Projekte/KPIs, Opportunities, Aufgaben.
// v1 nutzt Postgres-Volltextsuche (deutsch) + Recency; die Retrieval-Schnittstelle
// ist so geschnitten, dass pgvector-Embeddings (z. B. Voyage) später nur diese
// Datei ersetzen. Kernregel 1: jeder Chunk trägt seine Quellenangabe.
import { db } from "@/lib/db";
import { fmtKpiValue } from "@/lib/format";
import { dimensionLabel, PIPELINE_STAGES, PROJECT_STATUS } from "@/lib/i18n";

export type ContextChunk = {
  kind: "signal" | "bericht" | "projekt" | "opportunity" | "aufgabe";
  text: string;
  source: string; // Quellen-Chip
};

const MAX_SIGNAL_CHUNKS = 12;

/** Volltextsuche über Signale; fällt auf die relevantesten/neuesten zurück. */
async function searchSignals(customerId: string, query: string): Promise<ContextChunk[]> {
  type Row = {
    title: string;
    summary: string;
    dimension: string;
    sourceLabel: string | null;
    occurredAt: Date;
    relevance: number;
  };

  let rows: Row[] = [];
  try {
    rows = await db.$queryRaw<Row[]>`
      SELECT title, summary, dimension, "sourceLabel", "occurredAt", relevance
      FROM "Signal"
      WHERE "customerId" = ${customerId}
        AND review != 'irrelevant'
        AND to_tsvector('german', title || ' ' || summary)
            @@ websearch_to_tsquery('german', ${query})
      ORDER BY relevance DESC, "occurredAt" DESC
      LIMIT ${MAX_SIGNAL_CHUNKS}`;
  } catch {
    // ungültige Query-Syntax → Fallback unten
  }

  // Fallback/Auffüllen: relevanteste aktuelle Signale, damit der Chat immer Lage-Kontext hat
  if (rows.length < 5) {
    const recent = await db.signal.findMany({
      where: { customerId, review: { not: "irrelevant" } },
      orderBy: [{ occurredAt: "desc" }],
      take: MAX_SIGNAL_CHUNKS - rows.length,
    });
    const seen = new Set(rows.map((r) => r.title));
    rows = rows.concat(recent.filter((s) => !seen.has(s.title)));
  }

  return rows.map((s) => ({
    kind: "signal",
    text: `[${dimensionLabel(s.dimension)}, ${s.occurredAt.toISOString().slice(0, 10)}, Relevanz ${s.relevance}] ${s.title}: ${s.summary}`,
    source: s.sourceLabel ?? "Radar-Signal",
  }));
}

/** Stellt den vollständigen Kontext für eine Chat-Frage zusammen. */
export async function retrieveContext(customerId: string, query: string): Promise<ContextChunk[]> {
  const [signals, reports, projects, opportunities, tasks] = await Promise.all([
    searchSignals(customerId, query),
    db.report.findMany({ where: { customerId }, orderBy: { month: "desc" }, take: 2 }),
    db.customer.findUnique({
      where: { id: customerId },
      include: { projects: { include: { kpis: { include: { values: { orderBy: { period: "desc" }, take: 2 } } } } } },
    }),
    db.opportunity.findMany({
      where: { customerId, stage: { not: "dropped" } },
      orderBy: { updatedAt: "desc" },
    }),
    db.task.findMany({
      where: { customerId, status: "open" },
      include: { assignee: true },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
  ]);

  const chunks: ContextChunk[] = [...signals];

  for (const r of reports) {
    chunks.push({
      kind: "bericht",
      text: `Monatsbericht ${r.month} (${r.status === "approved" ? "freigegeben" : "Entwurf"}): ${r.execSummary}`,
      source: `Monatsbericht ${r.month}`,
    });
  }

  for (const p of projects?.projects ?? []) {
    const kpis = p.kpis
      .map((k) => {
        const [latest, prev] = k.values;
        if (!latest) return null;
        return `${k.label} ${fmtKpiValue(latest.value, k.unit)}${prev ? ` (Vormonat ${fmtKpiValue(prev.value, k.unit)})` : ""}${k.target != null ? `, Ziel ${fmtKpiValue(k.target, k.unit)}` : ""}`;
      })
      .filter(Boolean)
      .join("; ");
    chunks.push({
      kind: "projekt",
      text: `Projekt ${p.name} – Status: ${(PROJECT_STATUS[p.status] ?? PROJECT_STATUS.ok).label}${p.phase ? `, ${p.phase}` : ""}${kpis ? `. KPIs: ${kpis}` : ""}${p.description ? `. ${p.description}` : ""}`,
      source: `Projekt ${p.name}`,
    });
  }

  const stageLabel = (key: string) => PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key;
  for (const o of opportunities) {
    chunks.push({
      kind: "opportunity",
      text: `Opportunity „${o.title}“ – Stufe: ${stageLabel(o.stage)}${o.ownerLabel ? `, verantwortlich ${o.ownerLabel}` : ""}${o.rationale ? `. ${o.rationale}` : ""} (zuletzt bearbeitet ${o.updatedAt.toISOString().slice(0, 10)})`,
      source: "Opportunity-Pipeline",
    });
  }

  for (const t of tasks) {
    chunks.push({
      kind: "aufgabe",
      text: `Offene Aufgabe „${t.title}“ (${t.assignee?.name ?? "nicht zugewiesen"}${t.dueAt ? `, fällig ${t.dueAt.toISOString().slice(0, 10)}` : ""}${t.originLabel ? `, ${t.originLabel}` : ""})`,
      source: "Aufgabenliste",
    });
  }

  return chunks;
}
