// Kernregel 5: KPI-Abweichung unter Schwellenwert erzeugt automatisch ein Signal
// der Dimension "Internes Lagebild". Reine Prüf-Logik (getestet), DB-Zugriff im Orchestrator.
// Relativer .ts-Import, damit die Pipeline-Logik auch unter node --test läuft (npm test)
import { fmtKpiValue } from "../format.ts";

export type KpiCheckInput = {
  kpiId: string;
  label: string;
  unit: string | null;
  target: number | null;
  threshold: number | null;
  direction: string; // up = höher ist besser, down = niedriger ist besser
  latestValue: number | null;
  projectName: string;
};

export type KpiSignalDraft = {
  kpiId: string;
  title: string;
  summary: string;
  sourceLabel: string;
};

/** Prüft, ob ein KPI seinen Schwellenwert reißt, und formuliert das Signal. */
export function checkKpi(kpi: KpiCheckInput): KpiSignalDraft | null {
  if (kpi.threshold == null || kpi.latestValue == null) return null;
  const breached =
    kpi.direction === "down"
      ? kpi.latestValue > kpi.threshold
      : kpi.latestValue < kpi.threshold;
  if (!breached) return null;

  const value = fmtKpiValue(kpi.latestValue, kpi.unit);
  const threshold = fmtKpiValue(kpi.threshold, kpi.unit);
  const target = kpi.target != null ? fmtKpiValue(kpi.target, kpi.unit) : null;

  return {
    kpiId: kpi.kpiId,
    title: `KPI-Abweichung: ${kpi.label} unter Schwellenwert`,
    summary: `${kpi.label} im Projekt ${kpi.projectName} liegt mit ${value} ${
      kpi.direction === "down" ? "über" : "unter"
    } dem Schwellenwert von ${threshold}${target ? ` (Ziel: ${target})` : ""}.`,
    sourceLabel: `Projekt ${kpi.projectName} · KPI ${kpi.label}`,
  };
}

/** Dedupe-Schlüssel: ein KPI-Signal pro KPI und Monat. */
export function kpiSignalHash(kpiId: string, period: Date): string {
  return `kpi:${kpiId}:${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, "0")}`;
}
