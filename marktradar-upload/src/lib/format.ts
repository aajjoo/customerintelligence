// Datums- und Zahlenformatierung, de-AT. Reine Funktionen (testbar ohne DB).

const DAY_MS = 86_400_000;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "18. Juli" */
export function fmtDay(d: Date): string {
  return new Intl.DateTimeFormat("de-AT", { day: "numeric", month: "long" }).format(d);
}

/** "Dienstag, 21. Juli 2026" */
export function fmtFullDate(d: Date): string {
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "Heute, 06:40" / "Gestern" / "18. Juli" – wie im Prototyp */
export function fmtRelativeDay(d: Date, now: Date): string {
  const diffDays = Math.round((dayStart(now).getTime() - dayStart(d).getTime()) / DAY_MS);
  if (diffDays <= 0)
    return `Heute, ${new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" }).format(d)}`;
  if (diffDays === 1) return "Gestern";
  return fmtDay(d);
}

/** Fälligkeit: { label: "Fällig gestern", overdue: true } */
export function fmtDue(due: Date, now: Date): { label: string; overdue: boolean } {
  const diffDays = Math.round((dayStart(due).getTime() - dayStart(now).getTime()) / DAY_MS);
  if (diffDays < -1) return { label: `Überfällig seit ${fmtDay(due)}`, overdue: true };
  if (diffDays === -1) return { label: "Fällig gestern", overdue: true };
  if (diffDays === 0) return { label: "Fällig heute", overdue: false };
  return { label: `Fällig ${fmtDay(due)}`, overdue: false };
}

/** Letzte n Monate inkl. aktuellem: [{ start, label: "Jul" }] */
export function lastMonths(n: number, now: Date): { start: Date; label: string }[] {
  const out: { start: Date; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      start,
      label: new Intl.DateTimeFormat("de-AT", { month: "short" }).format(start),
    });
  }
  return out;
}

/** KPI-Wert mit Einheit: (46, "%") → "46 %" */
export function fmtKpiValue(value: number, unit?: string | null): string {
  const v = new Intl.NumberFormat("de-AT", { maximumFractionDigits: 1 }).format(value);
  if (unit === "%") return `${v} %`;
  if (unit === "pt") return `${v} Pkt.`;
  if (unit === "eur") return `€ ${v}`;
  return v;
}

/** KPI-Delta gegenüber Vormonat, Richtung berücksichtigt gute/schlechte Bewegung. */
export function kpiDelta(
  values: number[],
  direction: string,
  unit?: string | null
): { label: string; tone: "up" | "down" | "flat" } {
  if (values.length < 2) return { label: "neu", tone: "flat" };
  const diff = values[values.length - 1] - values[values.length - 2];
  if (diff === 0) return { label: "stabil", tone: "flat" };
  const arrow = diff > 0 ? "▲" : "▼";
  const unitLabel = unit === "%" ? " Pkt." : "";
  const good = direction === "down" ? diff < 0 : diff > 0;
  return {
    label: `${arrow} ${new Intl.NumberFormat("de-AT", { maximumFractionDigits: 1 }).format(Math.abs(diff))}${unitLabel} / Monat`,
    tone: good ? "up" : "down",
  };
}

/** "2026-07" → "Juli 2026" */
export function fmtReportMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1)
  );
}

/** Tageszeitabhängige Begrüßung */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}
