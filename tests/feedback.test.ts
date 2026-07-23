// Tests für die Feedback-Runde: Bereichs-Skills im Prompt, Scoring-System-Prompt,
// Frequenz-Logik – reine Funktionen ohne DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { instructionBlock } from "../src/lib/areaSkills.ts";
import {
  buildScoringPrompt,
  buildScoringSystemPrompt,
  NETURAL_PORTFOLIO,
} from "../src/lib/pipeline/scoring.ts";

test("instructionBlock: formatiert Anweisung, leer bei null", () => {
  assert.equal(instructionBlock(null), "");
  assert.match(instructionBlock("KI-Themen priorisieren."), /## Zusätzliche Anweisungen des Teams \(verbindlich\)\nKI-Themen priorisieren\./);
});

test("buildScoringSystemPrompt: Portfolio überschreibbar per Bereichs-Skill", () => {
  assert.match(buildScoringSystemPrompt(null), new RegExp("Analyse & Strategie"));
  assert.ok(buildScoringSystemPrompt(null).includes(NETURAL_PORTFOLIO));
  const custom = buildScoringSystemPrompt("Wir machen nur noch KI-Projekte.");
  assert.match(custom, /Wir machen nur noch KI-Projekte\./);
  assert.ok(!custom.includes("Analyse & Strategie"), "Standardtext wird ersetzt");
});

test("buildScoringPrompt: Team-Anweisung wird angehängt", () => {
  const profile = { name: "X", industry: "Y", markets: null, competitors: [], themes: [] };
  const items = [{ title: "T", url: null, excerpt: "", publishedAt: null }];
  const without = buildScoringPrompt(profile, items);
  assert.ok(!without.includes("Zusätzliche Anweisungen"));
  const withInstr = buildScoringPrompt(profile, items, "Jobs-Signale höher gewichten.");
  assert.match(withInstr, /Zusätzliche Anweisungen des Teams \(verbindlich\)\nJobs-Signale höher gewichten\./);
});

// Frequenz-Logik (wie in run.ts): daily immer, weekly nur Montag, off nie (Cron);
// manuelle Läufe recherchieren immer.
function researchDue(trigger: string, frequency: string, weekday: number): boolean {
  return (
    trigger !== "cron" ||
    frequency === "daily" ||
    (frequency === "weekly" && weekday === 1)
  );
}

test("researchDue: daily/weekly/off im Cron, manuell immer", () => {
  assert.equal(researchDue("cron", "daily", 3), true);
  assert.equal(researchDue("cron", "weekly", 1), true, "Montag");
  assert.equal(researchDue("cron", "weekly", 3), false, "Mittwoch");
  assert.equal(researchDue("cron", "off", 1), false);
  assert.equal(researchDue("manual", "off", 3), true, "manuell geht immer");
});
