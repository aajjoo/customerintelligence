// Tests für die automatische Web-Recherche (reine Funktionen ohne Netz).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildResearchPrompt,
  sanitizeResearchItems,
  RESEARCH_SCHEMA,
  type ResearchItem,
} from "../src/lib/pipeline/webresearch.ts";
import type { CustomerProfile } from "../src/lib/pipeline/types.ts";

const PROFILE: CustomerProfile = {
  name: "AlpenStahl",
  industry: "Stahlhandel",
  markets: "DACH",
  competitors: ["Ferrotec", "SteelOne"],
  themes: ["Kundenportal", "Digitaler Vertrieb"],
};

// ---------- buildResearchPrompt ----------

test("buildResearchPrompt nutzt promptTmpl und Kundenprofil", () => {
  const p = buildResearchPrompt(
    { name: "Mitbewerber", promptTmpl: "Suche Mitbewerber-News." },
    PROFILE,
    7
  );
  assert.ok(p.startsWith("Suche Mitbewerber-News."));
  assert.ok(p.includes("Kunde: AlpenStahl"));
  assert.ok(p.includes("Branche: Stahlhandel"));
  assert.ok(p.includes("Mitbewerber: Ferrotec, SteelOne"));
  assert.ok(p.includes("Strategische Themen: Kundenportal, Digitaler Vertrieb"));
  assert.ok(p.includes("letzten 7 Tage"));
});

test("buildResearchPrompt fällt ohne promptTmpl auf Skill-Namen zurück", () => {
  const p = buildResearchPrompt({ name: "Fachmedien", promptTmpl: null }, PROFILE, 10);
  assert.ok(p.includes('"Fachmedien"'));
  assert.ok(p.includes("letzten 10 Tage"));
});

test("buildResearchPrompt lässt leere Profilfelder weg", () => {
  const p = buildResearchPrompt(
    { name: "X", promptTmpl: "Y" },
    { ...PROFILE, markets: null, competitors: [], themes: [] },
    7
  );
  assert.ok(!p.includes("Märkte:"));
  assert.ok(!p.includes("Mitbewerber:"));
  assert.ok(!p.includes("Strategische Themen:"));
});

// ---------- sanitizeResearchItems ----------

const ITEM: ResearchItem = {
  titleDe: "Ferrotec launcht Portal",
  summaryDe: "Ferrotec kündigt ein Serviceportal an.",
  url: "https://presse.ferrotec.example/portal",
  sourceName: "Presse Ferrotec",
  dimension: "mitbewerb",
  relevance: 82,
};

test("sanitizeResearchItems behält valide Items", () => {
  const out = sanitizeResearchItems([ITEM]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], ITEM);
});

test("sanitizeResearchItems verwirft Items ohne Titel oder URL", () => {
  const out = sanitizeResearchItems([
    { ...ITEM, titleDe: "  " },
    { ...ITEM, url: "" },
    ITEM,
  ]);
  assert.equal(out.length, 1);
});

test("sanitizeResearchItems klemmt Relevanz auf 0-100", () => {
  const out = sanitizeResearchItems([
    { ...ITEM, relevance: 150 },
    { ...ITEM, relevance: -5 },
    { ...ITEM, relevance: undefined as unknown as number },
  ]);
  assert.deepEqual(out.map((i) => i.relevance), [100, 0, 0]);
});

test("sanitizeResearchItems korrigiert unbekannte Dimension auf markt", () => {
  const out = sanitizeResearchItems([{ ...ITEM, dimension: "quatsch" }]);
  assert.equal(out[0].dimension, "markt");
});

test("sanitizeResearchItems ergänzt sourceName aus dem Hostnamen", () => {
  const out = sanitizeResearchItems([{ ...ITEM, sourceName: "" }]);
  assert.equal(out[0].sourceName, "presse.ferrotec.example");
});

// ---------- Schema ----------

test("RESEARCH_SCHEMA verlangt items mit URL und Dimension-Enum", () => {
  assert.deepEqual(RESEARCH_SCHEMA.required, ["items"]);
  const item = RESEARCH_SCHEMA.properties.items.items;
  assert.ok(item.required.includes("url"));
  assert.ok(item.properties.dimension.enum.includes("mitbewerb"));
});
