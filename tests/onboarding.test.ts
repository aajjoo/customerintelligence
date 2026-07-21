// Tests für die Onboarding-Logik (Etappe 4) – reine Funktionen ohne Netz/DB/API.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  discoverFeeds,
  discoverRelevantPages,
  extractPageText,
} from "../src/lib/onboarding/crawl.ts";
import { buildExtractionPrompt, proposeSources } from "../src/lib/onboarding/extract.ts";
import { slugify } from "../src/lib/onboarding/slug.ts";

const HTML = `<html><head>
  <title>AlpenStahl AG – Stahl mit Zukunft</title>
  <link rel="alternate" type="application/rss+xml" title="Presse-Feed" href="/presse/feed.xml">
  <link rel="alternate" type="application/atom+xml" href="https://www.alpenstahl.example/atom.xml">
  <link rel="stylesheet" href="/style.css">
  <script>var x = "<a href='/fake'>kein Link</a>";</script>
</head><body>
  <nav><a href="/presse">Presse</a></nav>
  <h1>Stahl mit Zukunft</h1>
  <p>Wir liefern Stahl nach Österreich und Deutschland.</p>
  <a href="/presse">Aktuelles aus dem Unternehmen</a>
  <a href="/karriere/jobs">Offene Stellen</a>
  <a href="https://extern.example/artikel">Externer Artikel über News</a>
</body></html>`;

const BASE = "https://www.alpenstahl.example/";

test("discoverFeeds: rel=alternate RSS/Atom, relative URLs aufgelöst, dedupliziert", () => {
  const feeds = discoverFeeds(HTML, BASE);
  assert.equal(feeds.length, 2);
  assert.deepEqual(feeds[0], {
    url: "https://www.alpenstahl.example/presse/feed.xml",
    title: "Presse-Feed",
  });
  assert.equal(feeds[1].url, "https://www.alpenstahl.example/atom.xml");
});

test("discoverRelevantPages: Presse + Karriere, nur eigene Domain", () => {
  const pages = discoverRelevantPages(HTML, BASE);
  const kinds = pages.map((p) => p.kind).sort();
  assert.deepEqual(kinds, ["karriere", "presse"]);
  const presse = pages.find((p) => p.kind === "presse")!;
  assert.equal(presse.url, "https://www.alpenstahl.example/presse");
  // der externe Link enthält "News" im Text, ist aber fremde Domain → ausgeschlossen
  assert.ok(pages.every((p) => p.url.startsWith("https://www.alpenstahl.example/")));
});

test("extractPageText: Skripte/Styles/Nav raus, Text bleibt", () => {
  const text = extractPageText(HTML);
  assert.match(text, /Stahl mit Zukunft/);
  assert.match(text, /Österreich und Deutschland/);
  assert.ok(!text.includes("kein Link"), "Script-Inhalte werden entfernt");
  assert.ok(!text.includes("var x"), "Script-Code wird entfernt");
});

test("buildExtractionPrompt: enthält Seiten mit URL und Regeln", () => {
  const site = {
    url: BASE,
    pages: [{ url: BASE, title: "AlpenStahl", text: "Stahl nach Österreich." }],
    feeds: [],
    relevantPages: [],
  };
  const prompt = buildExtractionPrompt(site);
  assert.match(prompt, /### AlpenStahl \(https:\/\/www\.alpenstahl\.example\/\)/);
  assert.match(prompt, /Nichts erfinden/);
});

test("proposeSources: Feeds als news, Unterseiten als website, Fallback Startseite", () => {
  const site = {
    url: BASE,
    pages: [],
    feeds: [{ url: `${BASE}feed.xml`, title: "Presse-Feed" }],
    relevantPages: [
      { url: `${BASE}presse`, kind: "presse" as const, label: "Presse / News" },
    ],
  };
  const sources = proposeSources(site);
  assert.deepEqual(sources, [
    { kind: "news", label: "Presse-Feed", url: `${BASE}feed.xml` },
    { kind: "website", label: "Presse / News", url: `${BASE}presse` },
  ]);
  // Fallback ohne jede Discovery
  const empty = proposeSources({ url: BASE, pages: [], feeds: [], relevantPages: [] });
  assert.deepEqual(empty, [{ kind: "website", label: "Website", url: BASE }]);
});

test("slugify: Umlaute, Sonderzeichen, Länge", () => {
  assert.equal(slugify("AlpenStahl AG"), "alpenstahl-ag");
  assert.equal(slugify("Müller & Söhne GmbH"), "mueller-soehne-gmbh");
  assert.equal(slugify("  Café Crème  "), "cafe-creme");
  assert.ok(slugify("x".repeat(100)).length <= 60);
});
