// Reiner Teil der Berichtgenerierung (Etappe 5): Typen + Aufbau der Textbasis
// für Claude. Ohne DB-/SDK-Import, damit unter node --test lauffähig.
import { fmtKpiValue } from "../format.ts";
import { dimensionLabel, PIPELINE_STAGES, PROJECT_STATUS } from "../i18n.ts";

export type ReportSection = { title: string; text: string };
export type SuggestedTask = { title: string; dueInDays: number; reason: string };
export type ReportBody = { sections: ReportSection[]; suggestedTasks: SuggestedTask[] };

export type ReportInputData = {
  name: string;
  month: string;
  signals: {
    dimension: string;
    title: string;
    summary: string;
    sourceLabel: string | null;
    relevance: number;
    review: string;
  }[];
  projects: {
    name: string;
    status: string;
    phase: string | null;
    kpis: {
      label: string;
      unit: string | null;
      values: number[];
      target: number | null;
      threshold: number | null;
    }[];
  }[];
  opportunities: { title: string; stage: string; rationale: string | null }[];
  tasks: { title: string; status: string; overdue: boolean }[];
  prevExecSummary: string | null;
};

/** Monatsdaten des Kunden als kompakte Textbasis für den Bericht (rein, getestet). */
export function buildReportInput(data: ReportInputData): string {
  const signals = data.signals
    .filter((s) => s.review !== "irrelevant")
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 15)
    .map(
      (s) =>
        `- [${dimensionLabel(s.dimension)}] ${s.title} (Relevanz ${s.relevance}, Quelle: ${s.sourceLabel ?? "unbekannt"})\n  ${s.summary}`
    )
    .join("\n");

  const projects = data.projects
    .map((p) => {
      const kpis = p.kpis
        .map((k) => {
          const vals = k.values.map((v) => fmtKpiValue(v, k.unit)).join(" → ");
          const meta = [
            k.target != null ? `Ziel ${fmtKpiValue(k.target, k.unit)}` : null,
            k.threshold != null ? `Schwelle ${fmtKpiValue(k.threshold, k.unit)}` : null,
          ]
            .filter(Boolean)
            .join(", ");
          return `  - ${k.label}: ${vals}${meta ? ` (${meta})` : ""}`;
        })
        .join("\n");
      const status = (PROJECT_STATUS[p.status] ?? PROJECT_STATUS.ok).label;
      return `- ${p.name} · Status: ${status}${p.phase ? ` · ${p.phase}` : ""}${kpis ? `\n${kpis}` : ""}`;
    })
    .join("\n");

  const stageLabel = (key: string) => PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key;
  const opps = data.opportunities
    .map((o) => `- ${o.title} · ${stageLabel(o.stage)}${o.rationale ? ` · ${o.rationale}` : ""}`)
    .join("\n");

  const done = data.tasks.filter((t) => t.status === "done").length;
  const open = data.tasks.filter((t) => t.status === "open").length;
  const overdue = data.tasks.filter((t) => t.status === "open" && t.overdue).length;

  return `Erstelle den Monatsbericht ${data.month} für den Kunden ${data.name}.

## Signale des Monats (KI-bewertet, mit Quellen)
${signals || "keine"}

## Projekte & KPIs (Werte chronologisch, letzter = aktuell)
${projects || "keine laufenden Projekte"}

## Opportunities
${opps || "keine"}

## Aufgabenstand
${done} erledigt, ${open} offen, davon ${overdue} überfällig.

## Executive Summary des Vormonats
${data.prevExecSummary ?? "kein Vorbericht vorhanden"}

Regeln:
- Nur Aussagen, die durch die Daten oben belegt sind. Signal-Aussagen mit (Quelle: …) kennzeichnen.
- Abschnitt "Entwicklung gegenüber dem Vormonat": auf Basis des Vorberichts; ohne Vorbericht kurz sagen, dass dies der erste Bericht ist.
- Empfohlene Maßnahmen nur mit fachlicher Begründung (Bezug auf Signal, KPI oder Opportunity).
- Deutsch, sachlich, kompakt.`;
}
