// Kunden-Onboarding (Etappe 4), Schritt 2: Profilvorschlag.
// Claude extrahiert aus den gecrawlten Inhalten Unternehmen, Branche, Märkte,
// Mitbewerber-Kandidaten und strategische Themen (strukturierte Outputs).
// Quellenvorschläge (Feeds, Presse-/Karriereseiten) kommen aus der Discovery,
// nicht vom Modell – Kernregel 1: keine erfundenen Quellen.
import Anthropic from "@anthropic-ai/sdk";
import { crawlSite, type CrawledSite } from "./crawl.ts";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";

export type SourceProposal = {
  kind: "news" | "website";
  label: string;
  url: string;
};

export type CustomerProposal = {
  websiteUrl: string;
  name: string;
  industry: string;
  markets: string | null;
  competitors: string[];
  themes: string[];
  sources: SourceProposal[];
};

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Offizieller Unternehmensname (ohne Rechtsform-Zusätze nur wenn unklar)" },
    industry: { type: "string", description: "Branche, kurz (z. B. 'Stahl & Industrie', 'Handel')" },
    markets: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Märkte/Regionen laut Website (z. B. 'Österreich, Deutschland'), null wenn nicht erkennbar",
    },
    competitors: {
      type: "array",
      items: { type: "string" },
      description: "Mitbewerber-Kandidaten, NUR wenn aus den Inhalten ableitbar, sonst leer",
    },
    themes: {
      type: "array",
      items: { type: "string" },
      description: "3-6 strategische Themen des Unternehmens laut Website",
    },
  },
  required: ["name", "industry", "markets", "competitors", "themes"],
  additionalProperties: false,
} as const;

/** Baut den Extraktions-Prompt aus den gecrawlten Seiten (rein, getestet). */
export function buildExtractionPrompt(site: CrawledSite): string {
  const pagesBlock = site.pages
    .map((p) => `### ${p.title} (${p.url})\n${p.text}`)
    .join("\n\n");
  return `Extrahiere aus dem folgenden Website-Inhalt ein Kundenprofil für den Marktradar.

Regeln:
- Nur Angaben, die durch den Inhalt belegt sind. Nichts erfinden.
- competitors: nur nennen, wenn die Inhalte konkrete Wettbewerber erkennen lassen (z. B. Vergleiche, Marktumfeld). Im Zweifel leer lassen – das Team prüft die Kandidaten.
- themes: strategische Themen, die das Unternehmen selbst betont (z. B. Nachhaltigkeit, Digitalisierung, Expansion).
- Antworte auf Deutsch.

## Website-Inhalt
${pagesBlock}`;
}

/** Quellenvorschläge aus der Discovery ableiten (rein, getestet). */
export function proposeSources(site: CrawledSite): SourceProposal[] {
  const sources: SourceProposal[] = [];
  for (const feed of site.feeds.slice(0, 3)) {
    sources.push({ kind: "news", label: feed.title || "RSS-Feed", url: feed.url });
  }
  for (const page of site.relevantPages) {
    // Presse-/Karriereseiten als Website-Quellen (Crawler mit Änderungserkennung)
    sources.push({ kind: "website", label: page.label, url: page.url });
  }
  // Fallback: keine Quellen erkannt → Startseite beobachten
  if (sources.length === 0) {
    sources.push({ kind: "website", label: "Website", url: site.url });
  }
  return sources;
}

/** Crawlt die URL und erzeugt den Profilvorschlag via Claude.
 *  teamInstruction: Bereichs-Skill "onboarding", vom Aufrufer geladen (hält dieses Modul DB-frei). */
export async function extractProfile(
  url: string,
  teamInstruction?: string | null
): Promise<CustomerProposal> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt – Profilextraktion nicht möglich");
  }
  const site = await crawlSite(url);
  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      "Du bist die Onboarding-Extraktion des Netural Marktradars. Du erstellst aus Website-Inhalten präzise, belegbare Kundenprofile und antwortest ausschließlich mit dem geforderten JSON.",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content:
          buildExtractionPrompt(site) +
          (teamInstruction
            ? `\n\n## Zusätzliche Anweisungen des Teams (verbindlich)\n${teamInstruction}`
            : ""),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude hat die Extraktion abgelehnt (refusal)");
  }
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as Omit<CustomerProposal, "websiteUrl" | "sources">;

  return {
    websiteUrl: site.url,
    name: parsed.name,
    industry: parsed.industry,
    markets: parsed.markets,
    competitors: parsed.competitors,
    themes: parsed.themes,
    sources: proposeSources(site),
  };
}
