// Tests für die Pipeline-Logik (Konventionen: verpflichtend) – reine Funktionen ohne DB/Netz.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed, stripHtml } from "../src/lib/pipeline/rss.ts";
import { extractItems } from "../src/lib/pipeline/website.ts";
import { contentHash, dedupe, normalizeTitle } from "../src/lib/pipeline/dedupe.ts";
import { buildScoringPrompt, parseScoringResponse } from "../src/lib/pipeline/scoring.ts";
import { checkKpi, kpiSignalHash } from "../src/lib/pipeline/kpi.ts";
import type { CustomerProfile, RawItem } from "../src/lib/pipeline/types.ts";

// ---------- RSS / Atom ----------

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Presse Ferrotec</title>
  <item>
    <title>Ferrotec &amp; Partner: neues Serviceportal</title>
    <link>https://presse.ferrotec.example/portal</link>
    <description><![CDATA[<p>Der Konzern k&uuml;ndigt ein <b>Portal</b> an.</p>]]></description>
    <pubDate>Mon, 20 Jul 2026 06:40:00 GMT</pubDate>
  </item>
  <item>
    <title>Quartalszahlen Q2</title>
    <link>https://presse.ferrotec.example/q2</link>
    <description>Umsatz stabil.</description>
  </item>
</channel></rss>`;

const ATOM_FIXTURE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>EU Aktuell</title>
  <entry>
    <title>CBAM-Berichtspflichten erweitert</title>
    <link rel="self" href="https://eu.example/self"/>
    <link href="https://eu.example/cbam"/>
    <summary>Die EU konkretisiert die Berichterstattung.</summary>
    <updated>2026-07-18T09:00:00Z</updated>
  </entry>
</feed>`;

test("parseFeed: RSS 2.0 mit CDATA und Entities", () => {
  const items = parseFeed(RSS_FIXTURE);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Ferrotec & Partner: neues Serviceportal");
  assert.equal(items[0].url, "https://presse.ferrotec.example/portal");
  assert.match(items[0].excerpt, /Portal/);
  assert.ok(!items[0].excerpt.includes("<p>"), "HTML wird entfernt");
  assert.equal(items[0].publishedAt?.getUTCDate(), 20);
  assert.equal(items[1].publishedAt, null);
});

test("parseFeed: Atom mit self-Link-Filter", () => {
  const items = parseFeed(ATOM_FIXTURE);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "CBAM-Berichtspflichten erweitert");
  assert.equal(items[0].url, "https://eu.example/cbam", "self-Link wird übersprungen");
});

const RDF_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="http://purl.org/rss/1.0/">
<channel rdf:about="https://orf.at/"><title>news.ORF.at</title></channel>
<item rdf:about="https://orf.at/stories/1">
  <title>Neue Förderlinie beschlossen</title>
  <link>https://orf.at/stories/1</link>
  <description>Das Antragsfenster öffnet im September.</description>
  <dc:date>2026-07-19T08:00:00+02:00</dc:date>
</item>
</rdf:RDF>`;

test("parseFeed: RSS 1.0 / RDF (ORF-Format)", () => {
  const items = parseFeed(RDF_FIXTURE);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Neue Förderlinie beschlossen");
  assert.equal(items[0].url, "https://orf.at/stories/1");
  assert.equal(items[0].publishedAt?.getUTCDate(), 19);
});

test("parseFeed: unbekanntes Format wirft", () => {
  assert.throws(() => parseFeed("<html><body>keine Feeds</body></html>"));
});

test("stripHtml: Tags und Entities", () => {
  assert.equal(stripHtml("<b>Hallo</b>&nbsp;&amp;&nbsp;Welt"), "Hallo & Welt");
});

// ---------- Website-Crawler ----------

const HTML_FIXTURE = `<html><head>
  <title>Presse – AlpenStahl</title>
  <meta name="description" content="Neuigkeiten aus dem Konzern">
</head><body>
  <h1>Pressebereich</h1>
  <h2><a href="/presse/logistik">AlpenStahl digitalisiert die Werkslogistik</a></h2>
  <h3><a href="https://extern.example/artikel">Neuer Standort in Italien</a></h3>
  <h2>OK</h2>
</body></html>`;

test("extractItems: Überschriften mit Links, relative URLs aufgelöst", () => {
  const { items, contentHash: hash } = extractItems(HTML_FIXTURE, "https://www.alpenstahl.example/presse");
  const titles = items.map((i) => i.title);
  assert.ok(titles.includes("AlpenStahl digitalisiert die Werkslogistik"));
  assert.ok(titles.includes("Neuer Standort in Italien"));
  assert.ok(!titles.includes("OK"), "zu kurze Überschriften werden verworfen");
  const logistik = items.find((i) => i.title.includes("Werkslogistik"))!;
  assert.equal(logistik.url, "https://www.alpenstahl.example/presse/logistik");
  assert.equal(typeof hash, "string");
});

test("extractItems: Änderungserkennung – gleicher Inhalt, gleicher Hash", () => {
  const a = extractItems(HTML_FIXTURE, "https://x.example");
  const b = extractItems(HTML_FIXTURE, "https://x.example");
  const c = extractItems(HTML_FIXTURE.replace("Werkslogistik", "Hafenlogistik"), "https://x.example");
  assert.equal(a.contentHash, b.contentHash);
  assert.notEqual(a.contentHash, c.contentHash);
});

// ---------- Dedupe ----------

test("normalizeTitle: Groß/Klein, Satzzeichen, Anführungszeichen", () => {
  assert.equal(
    normalizeTitle("Ferrotec kündigt „Serviceportal“ an!"),
    normalizeTitle("ferrotec kündigt Serviceportal an")
  );
});

test("dedupe: bekannte Hashes und Duplikate im Batch werden entfernt", () => {
  const items = [
    { title: "Ferrotec kündigt Serviceportal an" },
    { title: "FERROTEC kündigt Serviceportal an!" }, // Duplikat (Normalisierung)
    { title: "Etwas ganz anderes" },
  ];
  const known = new Set([contentHash({ title: "Etwas ganz anderes" })]);
  const fresh = dedupe(items, known);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].item.title, "Ferrotec kündigt Serviceportal an");
});

// ---------- Scoring (Prompt + Antwort-Mapping, ohne API) ----------

const PROFILE: CustomerProfile = {
  name: "AlpenStahl AG",
  industry: "Stahl & Industrie",
  markets: "DACH",
  competitors: ["Ferrotec"],
  themes: ["Digitale Services"],
};

const ITEMS: RawItem[] = [
  { title: "Ferrotec launcht Portal", url: "https://x/1", excerpt: "…", publishedAt: null },
  { title: "Wetterbericht", url: "https://x/2", excerpt: "…", publishedAt: null },
];

test("buildScoringPrompt: enthält Profil und indizierte Items", () => {
  const prompt = buildScoringPrompt(PROFILE, ITEMS);
  assert.match(prompt, /AlpenStahl AG/);
  assert.match(prompt, /Mitbewerber: Ferrotec/);
  assert.match(prompt, /\[0\] Ferrotec launcht Portal/);
  assert.match(prompt, /\[1\] Wetterbericht/);
});

test("parseScoringResponse: mappt per Index, klemmt Relevanz, ignoriert fremde Indizes", () => {
  const json = JSON.stringify({
    items: [
      { index: 0, relevance: 150, dimension: "mitbewerb", titleDe: "Ferrotec-Portal", summaryDe: "…" },
      { index: 7, relevance: 50, dimension: "markt", titleDe: "x", summaryDe: "x" },
    ],
  });
  const scored = parseScoringResponse(json, ITEMS);
  assert.equal(scored.length, 1);
  assert.equal(scored[0].relevance, 100, "Relevanz wird auf 0-100 geklemmt");
  assert.equal(scored[0].title, "Ferrotec launcht Portal", "Original-Referenz bleibt");
  assert.equal(scored[0].titleDe, "Ferrotec-Portal");
});

// ---------- KPI (Kernregel 5) ----------

test("checkKpi: unter Schwelle (direction up) erzeugt Signal-Entwurf", () => {
  const draft = checkKpi({
    kpiId: "k1", label: "Portal-Adoption", unit: "%", target: 65, threshold: 50,
    direction: "up", latestValue: 46, projectName: "Kundenportal 2.0",
  });
  assert.ok(draft);
  assert.match(draft!.title, /Portal-Adoption unter Schwellenwert/);
  assert.match(draft!.summary, /46 %/);
  assert.match(draft!.summary, /50 %/);
  assert.match(draft!.sourceLabel, /Kundenportal 2\.0/, "Quellenbezug (Kernregel 1)");
});

test("checkKpi: über Schwelle → kein Signal; direction down invertiert", () => {
  assert.equal(
    checkKpi({ kpiId: "k", label: "Adoption", unit: "%", target: 65, threshold: 50, direction: "up", latestValue: 52, projectName: "P" }),
    null
  );
  // direction down: niedriger ist besser → Wert ÜBER Schwelle reißt
  assert.ok(
    checkKpi({ kpiId: "k", label: "Fehlerrate", unit: "%", target: 1, threshold: 5, direction: "down", latestValue: 7, projectName: "P" })
  );
  assert.equal(
    checkKpi({ kpiId: "k", label: "Fehlerrate", unit: "%", target: 1, threshold: 5, direction: "down", latestValue: 3, projectName: "P" }),
    null
  );
});

test("checkKpi: ohne Schwelle oder Wert → kein Signal", () => {
  assert.equal(
    checkKpi({ kpiId: "k", label: "X", unit: null, target: null, threshold: null, direction: "up", latestValue: 10, projectName: "P" }),
    null
  );
  assert.equal(
    checkKpi({ kpiId: "k", label: "X", unit: null, target: 5, threshold: 5, direction: "up", latestValue: null, projectName: "P" }),
    null
  );
});

test("kpiSignalHash: ein Signal pro KPI und Monat", () => {
  assert.equal(
    kpiSignalHash("k1", new Date("2026-07-20")),
    kpiSignalHash("k1", new Date("2026-07-01"))
  );
  assert.notEqual(
    kpiSignalHash("k1", new Date("2026-07-20")),
    kpiSignalHash("k1", new Date("2026-08-01"))
  );
});
