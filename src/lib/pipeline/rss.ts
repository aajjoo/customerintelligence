// News-Konnektor: RSS 2.0 und Atom. Reiner Parser (testbar ohne Netz),
// Abruf über fetchFeed().
import { XMLParser } from "fast-xml-parser";
import type { RawItem } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // CDATA-Inhalte als normalen Text behandeln
  cdataPropName: false,
});

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"] ?? "").trim();
  }
  return String(v).trim();
}

/** Entfernt HTML-Tags und normalisiert Whitespace (Teaser-Texte in Feeds sind oft HTML). */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parst RSS-2.0-, RSS-1.0-(RDF)- oder Atom-XML zu RawItems. Wirft bei nicht erkennbarem Format. */
export function parseFeed(xml: string): RawItem[] {
  const doc = parser.parse(xml);

  // RSS 2.0: rss > channel > item[]
  if (doc.rss?.channel) {
    return asArray(doc.rss.channel.item).map((item: Record<string, unknown>) => ({
      title: stripHtml(text(item.title)),
      url: text(item.link) || null,
      excerpt: stripHtml(text(item.description)).slice(0, 1000),
      publishedAt: item.pubDate ? new Date(text(item.pubDate)) : null,
    }));
  }

  // RSS 1.0 / RDF (z. B. ORF): rdf:RDF > item[] auf oberster Ebene, Datum als dc:date
  if (doc["rdf:RDF"]) {
    return asArray(doc["rdf:RDF"].item).map((item: Record<string, unknown>) => ({
      title: stripHtml(text(item.title)),
      url: text(item.link) || null,
      excerpt: stripHtml(text(item.description)).slice(0, 1000),
      publishedAt: item["dc:date"] ? new Date(text(item["dc:date"])) : null,
    }));
  }

  // Atom: feed > entry[]
  if (doc.feed) {
    return asArray(doc.feed.entry).map((entry: Record<string, unknown>) => {
      const links = asArray(entry.link as object | object[]);
      const href =
        (links.find((l) => (l as Record<string, string>)["@_rel"] !== "self") as
          | Record<string, string>
          | undefined)?.["@_href"] ?? null;
      return {
        title: stripHtml(text(entry.title)),
        url: href,
        excerpt: stripHtml(text(entry.summary ?? entry.content)).slice(0, 1000),
        publishedAt: entry.updated || entry.published
          ? new Date(text(entry.updated ?? entry.published))
          : null,
      };
    });
  }

  throw new Error("Kein RSS- oder Atom-Feed erkannt");
}

/** Ruft einen Feed ab und parst ihn. */
export async function fetchFeed(url: string): Promise<RawItem[]> {
  const res = await fetch(url, {
    headers: { "user-agent": "Netural-Marktradar/1.0 (+https://netural.com)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Feed ${url}: HTTP ${res.status}`);
  return parseFeed(await res.text());
}
