// KPI-Import (Etappe 7): CSV-Import von KPI-Werten je Projekt.
// Format: kpi;periode;wert  (Semikolon oder Komma, Periode YYYY-MM,
// Dezimalkomma erlaubt). Reine Parse-Logik (getestet), DB im Aufrufer.

export type KpiImportRow = { kpiLabel: string; period: Date; value: number };

export function parseKpiCsv(csv: string): { rows: KpiImportRow[]; errors: string[] } {
  const rows: KpiImportRow[] = [];
  const errors: string[] = [];

  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const [i, line] of lines.entries()) {
    // Semikolon bevorzugt (erlaubt Dezimalkomma im Wert); sonst Komma
    const sep = line.includes(";") ? ";" : ",";
    const cols = line.split(sep).map((c) => c.trim());
    // Kopfzeile überspringen
    if (i === 0 && /kpi/i.test(cols[0] ?? "") && !/^\d/.test(cols[2] ?? "")) continue;
    if (cols.length < 3) {
      errors.push(`Zeile ${i + 1}: erwartet "kpi;periode;wert"`);
      continue;
    }
    const [label, periodStr, valueStr] = cols;
    const m = /^(\d{4})-(\d{2})$/.exec(periodStr);
    if (!m) {
      errors.push(`Zeile ${i + 1}: Periode "${periodStr}" nicht im Format YYYY-MM`);
      continue;
    }
    const value = Number(valueStr.replace(",", "."));
    if (!Number.isFinite(value)) {
      errors.push(`Zeile ${i + 1}: Wert "${valueStr}" ist keine Zahl`);
      continue;
    }
    rows.push({
      kpiLabel: label,
      period: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)),
      value,
    });
  }
  return { rows, errors };
}
