// Website-Crawler v1: holt eine Seite, extrahiert Titel, Beschreibung und
// Überschriften mit Links. Änderungserkennung über Content-Hash im Source-State –
// unveränderte Seiten erzeugen keine neuen Items.
import { createHash } from "node:crypto";
// Relative .ts-Imports, damit die Pipeline-Logik auch unter node --test läuft (npm test)
import { stripHtml } from "./rss.ts";
import type { RawItem } from "./types.ts";

export type CrawlResult = {
  items: RawItem[];
  /** Hash des extrahierten Inhalts – gegen Source.stateJson vergleichen */
  contentHash: string;
};

/** Reine Extraktion (testbar ohne Netz): Titel/Meta + verlinkte Überschriften. */
export function extractItems(html: string, baseUrl: string): CrawlResult {
  const items: RawItem[] = [];

  const title = stripHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const description = stripHtml(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ??
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1] ??
      ""
  );

  // Überschriften (h1–h3), bevorzugt mit Link – typisch für Presse-/News-Übersichten
  const headingRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html)) !== null) {
    const inner = m[2];
    const headline = stripHtml(inner);
    if (headline.length < 10) continue; // Navigations-Reste überspringen
    const href = /<a[^>]+href=["']([^"']+)["']/i.exec(inner)?.[1] ?? null;
    items.push({
      title: headline.slice(0, 300),
      url: href ? resolveUrl(href, baseUrl) : baseUrl,
      excerpt: "",
      publishedAt: null,
    });
  }

  // Fallback: keine brauchbaren Überschriften → Seite selbst als ein Item
  if (items.length === 0 && title) {
    items.push({
      title: title.slice(0, 300),
      url: baseUrl,
      excerpt: description.slice(0, 1000),
      publishedAt: null,
    });
  }

  const contentHash = createHash("sha256")
    .update(items.map((i) => `${i.title}|${i.url}`).join("\n"))
    .digest("hex");

  return { items, contentHash };
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return base;
  }
}

/** Ruft eine Website ab und extrahiert Items. */
export async function crawlWebsite(url: string): Promise<CrawlResult> {
  const res = await fetch(url, {
    headers: { "user-agent": "Netural-Marktradar/1.0 (+https://netural.com)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Website ${url}: HTTP ${res.status}`);
  return extractItems(await res.text(), url);
}
