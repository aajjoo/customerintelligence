// Kunden-Onboarding (Etappe 4), Schritt 1: Crawl.
// Holt die Startseite, entdeckt RSS-Feeds und relevante Unterseiten
// (Presse/News, Karriere) und extrahiert Text als Basis für den Profilvorschlag.
import { stripHtml } from "../pipeline/rss.ts";

export type DiscoveredFeed = { url: string; title: string };
export type DiscoveredPage = { url: string; kind: "presse" | "karriere"; label: string };

export type CrawledSite = {
  url: string;
  /** Extrahierter Text je Seite (Startseite zuerst), für die Claude-Extraktion */
  pages: { url: string; title: string; text: string }[];
  feeds: DiscoveredFeed[];
  relevantPages: DiscoveredPage[];
};

/** RSS/Atom-Feeds aus <link rel="alternate"> (rein, getestet). */
export function discoverFeeds(html: string, baseUrl: string): DiscoveredFeed[] {
  const feeds: DiscoveredFeed[] = [];
  const linkRe = /<link[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    if (!/type=["']application\/(rss|atom)\+xml["']/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const title = /title=["']([^"']*)["']/i.exec(tag)?.[1] ?? "RSS-Feed";
    feeds.push({ url: resolve(href, baseUrl), title: stripHtml(title) });
  }
  // Duplikate (gleiche URL) entfernen
  return feeds.filter((f, i) => feeds.findIndex((g) => g.url === f.url) === i);
}

const PAGE_PATTERNS: { kind: DiscoveredPage["kind"]; label: string; re: RegExp }[] = [
  { kind: "presse", label: "Presse / News", re: /presse|press|news|aktuell|blog|media/i },
  { kind: "karriere", label: "Karriere", re: /karriere|career|jobs|stellen/i },
];

/** Relevante Unterseiten (Presse, Karriere) aus Links der Startseite (rein, getestet). */
export function discoverRelevantPages(html: string, baseUrl: string): DiscoveredPage[] {
  const found = new Map<string, DiscoveredPage>();
  const aRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const base = new URL(baseUrl);
  let m: RegExpExecArray | null;
  while ((m = aRe.exec(html)) !== null) {
    const href = m[1];
    const label = stripHtml(m[2]);
    const url = resolve(href, baseUrl);
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    if (host !== base.host) continue; // nur eigene Domain
    for (const p of PAGE_PATTERNS) {
      if (found.has(p.kind)) continue;
      if (p.re.test(href) || p.re.test(label)) {
        found.set(p.kind, { url, kind: p.kind, label: p.label });
      }
    }
  }
  return [...found.values()];
}

/** Sichtbaren Text einer Seite extrahieren: Skripte/Styles raus, Tags strippen (rein, getestet). */
export function extractPageText(html: string, maxChars = 8000): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return stripHtml(cleaned).slice(0, maxChars);
}

function resolve(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return base;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "Netural-Marktradar/1.0 (+https://netural.com)" },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Crawlt Startseite + bis zu 2 relevante Unterseiten. */
export async function crawlSite(inputUrl: string): Promise<CrawledSite> {
  const url = inputUrl.startsWith("http") ? inputUrl : `https://${inputUrl}`;
  const html = await fetchHtml(url);
  const title = stripHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? url);

  const feeds = discoverFeeds(html, url);
  const relevantPages = discoverRelevantPages(html, url);

  const pages: CrawledSite["pages"] = [{ url, title, text: extractPageText(html) }];
  for (const page of relevantPages.slice(0, 2)) {
    try {
      const sub = await fetchHtml(page.url);
      pages.push({
        url: page.url,
        title: stripHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(sub)?.[1] ?? page.label),
        text: extractPageText(sub, 5000),
      });
    } catch {
      // Unterseite nicht erreichbar → Startseite reicht
    }
  }

  return { url, pages, feeds, relevantPages };
}
