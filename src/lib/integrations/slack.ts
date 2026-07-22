// Slack-Integration (Etappe 7): Benachrichtigungen über Incoming Webhook.
// Konfiguration über SLACK_WEBHOOK_URL; ohne Konfiguration werden Aufrufe
// still übersprungen (die App bleibt voll funktionsfähig).
// Ausspielung nach außen nur für System-Notifications (Pipeline-Lage) bzw.
// nach menschlicher Freigabe (Workflows, Kernregel 2).

export function slackConfigured(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL;
}

/** Sendet eine Nachricht in den konfigurierten Slack-Kanal. */
export async function postToSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Slack: HTTP ${res.status}`);
  return true;
}

/** Formatiert die Pipeline-Zusammenfassung eines Laufs (rein, getestet). */
export function formatRunSummary(
  stats: {
    customer: string;
    created: number;
    kpiSignals: number;
    taskSignals: number;
    errors: string[];
  }[]
): string | null {
  const relevant = stats.filter(
    (s) => s.created + s.kpiSignals + s.taskSignals > 0 || s.errors.length > 0
  );
  if (relevant.length === 0) return null;

  const lines = relevant.map((s) => {
    const parts: string[] = [];
    if (s.created > 0) parts.push(`${s.created} neue Signale`);
    if (s.kpiSignals > 0) parts.push(`${s.kpiSignals} KPI-Abweichung${s.kpiSignals > 1 ? "en" : ""}`);
    if (s.taskSignals > 0) parts.push(`${s.taskSignals} überfällige Aufgabe${s.taskSignals > 1 ? "n" : ""}`);
    if (s.errors.length > 0) parts.push(`${s.errors.length} Fehler`);
    return `• *${s.customer}*: ${parts.join(", ")}`;
  });
  return `*Marktradar – täglicher Lauf*\n${lines.join("\n")}`;
}
