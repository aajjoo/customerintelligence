// Jira/Confluence-Konnektor (Etappe 7 / Feedback-Runde 2, Konzept 5.1):
// Projekte werden aus dem führenden System übernommen und synchron gehalten.
// Env-gated: ohne JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN bleiben Import & Sync aus.
// Jira Cloud REST v3 + Confluence Cloud REST (gleiche Instanz unter /wiki).

export type JiraProjectInfo = { key: string; name: string; url: string };

export type TicketWeek = { week: string; created: number; resolved: number };

export type TicketStats = {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  weeks: TicketWeek[]; // letzte 8 Wochen
  spentHours: number | null; // Summe Worklogs (falls gepflegt)
};

export type IssueExcerpt = {
  key: string;
  summary: string;
  status: string;
  updated: string;
  comment: string | null; // letzter Kommentar (Text)
};

export type ConfluenceExcerpt = { title: string; url: string; excerpt: string };

export function jiraConfigured(): boolean {
  return !!(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN);
}

function authHeader(): string {
  const token = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
  ).toString("base64");
  return `Basic ${token}`;
}

function baseUrl(): string {
  return (process.env.JIRA_BASE_URL ?? "").replace(/\/$/, "");
}

async function jiraGet(path: string): Promise<any> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Jira ${path.split("?")[0]}: HTTP ${res.status}`);
  }
  return res.json();
}

/** Alle (nicht archivierten) Jira-Projekte – Basis für den Import-Vorschlag. */
export async function listJiraProjects(): Promise<JiraProjectInfo[]> {
  const data = await jiraGet("/rest/api/3/project/search?status=live&maxResults=100");
  return (data.values ?? []).map((p: any) => ({
    key: p.key,
    name: p.name,
    url: `${baseUrl()}/browse/${p.key}`,
  }));
}

/** ISO-Woche als "KW x" mit Montag als Start (rein, getestet). */
export function weekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `KW ${week}`;
}

/** Aggregiert Issues zu Ticket-Statistik (rein, getestet). */
export function aggregateIssues(
  issues: {
    statusCategory: string; // new | indeterminate | done
    created: string;
    resolutiondate: string | null;
    timespentSeconds: number | null;
  }[],
  now: Date
): TicketStats {
  const stats: TicketStats = {
    total: issues.length,
    open: 0,
    inProgress: 0,
    done: 0,
    weeks: [],
    spentHours: null,
  };
  // 8 Wochen-Fenster, Montag als Wochenstart
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const weekStarts: Date[] = [];
  for (let i = 7; i >= 0; i--) {
    weekStarts.push(new Date(monday.getTime() - i * 7 * 86_400_000));
  }
  stats.weeks = weekStarts.map((ws) => ({ week: weekLabel(ws), created: 0, resolved: 0 }));

  let spentSeconds = 0;
  let hasSpent = false;
  for (const issue of issues) {
    if (issue.statusCategory === "done") stats.done++;
    else if (issue.statusCategory === "indeterminate") stats.inProgress++;
    else stats.open++;
    if (issue.timespentSeconds) {
      spentSeconds += issue.timespentSeconds;
      hasSpent = true;
    }
    const bucket = (dateStr: string | null): number => {
      if (!dateStr) return -1;
      const t = new Date(dateStr).getTime();
      for (let i = weekStarts.length - 1; i >= 0; i--) {
        if (t >= weekStarts[i].getTime()) {
          return t < weekStarts[i].getTime() + 7 * 86_400_000 ? i : -1;
        }
      }
      return -1;
    };
    const c = bucket(issue.created);
    if (c >= 0) stats.weeks[c].created++;
    const r = bucket(issue.resolutiondate);
    if (r >= 0) stats.weeks[r].resolved++;
  }
  stats.spentHours = hasSpent ? Math.round((spentSeconds / 3600) * 10) / 10 : null;
  return stats;
}

/** Ticket-Statistik eines Jira-Projekts (paginierte Suche, Felder minimal). */
export async function fetchTicketStats(projectKey: string, now: Date): Promise<TicketStats> {
  const issues: any[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      jql: `project = "${projectKey}"`,
      fields: "status,created,resolutiondate,timespent",
      maxResults: "100",
    });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);
    const data = await jiraGet(`/rest/api/3/search/jql?${params}`);
    issues.push(...(data.issues ?? []));
    if (!data.nextPageToken || (data.issues ?? []).length === 0) break;
    nextPageToken = data.nextPageToken;
  }
  return aggregateIssues(
    issues.map((i) => ({
      statusCategory: i.fields?.status?.statusCategory?.key ?? "new",
      created: i.fields?.created,
      resolutiondate: i.fields?.resolutiondate ?? null,
      timespentSeconds: i.fields?.timespent ?? null,
    })),
    now
  );
}

/** Text aus Atlassian-Document-Format ziehen (rein, getestet). */
export function adfToText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text ?? "";
  if (Array.isArray(node.content)) {
    return node.content.map(adfToText).join(node.type === "paragraph" ? "" : " ").trim();
  }
  return "";
}

/** Jüngste Issues mit letztem Kommentar – Material für die KI-Einschätzung. */
export async function fetchRecentIssues(
  projectKey: string,
  limit = 25
): Promise<IssueExcerpt[]> {
  const params = new URLSearchParams({
    jql: `project = "${projectKey}" ORDER BY updated DESC`,
    fields: "summary,status,updated,comment",
    maxResults: String(limit),
  });
  const data = await jiraGet(`/rest/api/3/search/jql?${params}`);
  return (data.issues ?? []).map((i: any) => {
    const comments = i.fields?.comment?.comments ?? [];
    const last = comments[comments.length - 1];
    return {
      key: i.key,
      summary: i.fields?.summary ?? "",
      status: i.fields?.status?.name ?? "",
      updated: i.fields?.updated ?? "",
      comment: last ? adfToText(last.body).slice(0, 400) : null,
    };
  });
}

/** Jüngst geänderte Confluence-Seiten, die das Projekt (Key/Name) erwähnen. */
export async function fetchConfluencePages(
  query: string,
  limit = 5
): Promise<ConfluenceExcerpt[]> {
  const cql = encodeURIComponent(`type = page AND text ~ "${query}" ORDER BY lastmodified DESC`);
  const data = await jiraGet(
    `/wiki/rest/api/search?cql=${cql}&limit=${limit}&excerpt=highlight`
  );
  return (data.results ?? []).map((r: any) => ({
    title: r.content?.title ?? r.title ?? "",
    url: `${baseUrl()}/wiki${r.url ?? r.content?._links?.webui ?? ""}`,
    excerpt: String(r.excerpt ?? "")
      .replace(/@@@\w*hl@@@/g, "")
      .slice(0, 400),
  }));
}
