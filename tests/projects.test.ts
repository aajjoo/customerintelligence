// Tests für den Projekte-Bereich: Jira-Aggregation und Einschätzungs-Prompt
// (reine Funktionen ohne Netz/DB).
import { test } from "node:test";
import assert from "node:assert/strict";
import { adfToText, aggregateIssues, weekLabel } from "../src/lib/integrations/jira.ts";
import { buildHealthPrompt, HEALTH_SCHEMA } from "../src/lib/projects/health.ts";

const NOW = new Date("2026-07-23T12:00:00Z"); // Donnerstag, Woche startet Mo 20.07.

// ---------- aggregateIssues ----------

test("aggregateIssues zählt Status-Kategorien und Wochen-Buckets", () => {
  const stats = aggregateIssues(
    [
      { statusCategory: "new", created: "2026-07-21T09:00:00Z", resolutiondate: null, timespentSeconds: 7200 },
      { statusCategory: "indeterminate", created: "2026-07-14T09:00:00Z", resolutiondate: null, timespentSeconds: null },
      { statusCategory: "done", created: "2026-07-01T09:00:00Z", resolutiondate: "2026-07-22T09:00:00Z", timespentSeconds: 3600 },
      { statusCategory: "done", created: "2026-01-05T09:00:00Z", resolutiondate: "2026-01-08T09:00:00Z", timespentSeconds: null },
    ],
    NOW
  );
  assert.equal(stats.total, 4);
  assert.equal(stats.open, 1);
  assert.equal(stats.inProgress, 1);
  assert.equal(stats.done, 2);
  assert.equal(stats.weeks.length, 8);
  const current = stats.weeks[stats.weeks.length - 1];
  assert.equal(current.created, 1); // 21.07. angelegt
  assert.equal(current.resolved, 1); // 22.07. gelöst
  // Januar-Issue liegt außerhalb des 8-Wochen-Fensters
  assert.equal(stats.weeks.reduce((n, w) => n + w.resolved, 0), 1);
  assert.equal(stats.spentHours, 3); // 7200s + 3600s
});

test("aggregateIssues ohne Worklogs liefert spentHours null", () => {
  const stats = aggregateIssues(
    [{ statusCategory: "new", created: "2026-07-21T09:00:00Z", resolutiondate: null, timespentSeconds: null }],
    NOW
  );
  assert.equal(stats.spentHours, null);
});

test("weekLabel liefert Kalenderwoche", () => {
  assert.equal(weekLabel(new Date("2026-01-05T00:00:00Z")), "KW 2");
  assert.equal(weekLabel(new Date("2026-07-20T00:00:00Z")), "KW 30");
});

// ---------- adfToText ----------

test("adfToText extrahiert Text aus Atlassian Document Format", () => {
  const adf = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Deployment blockiert, " },
          { type: "text", text: "warten auf Kunde." },
        ],
      },
    ],
  };
  assert.equal(adfToText(adf), "Deployment blockiert, warten auf Kunde.");
});

// ---------- buildHealthPrompt ----------

const INPUT = {
  projectName: "Kundenportal",
  customerName: "AlpenStahl",
  phase: "Umsetzung · Sprint 12",
  budgetHours: 800,
  spentHours: 720,
  dbTargetPct: 35,
  stats: {
    total: 120,
    open: 30,
    inProgress: 10,
    done: 80,
    weeks: [{ week: "KW 29", created: 4, resolved: 6 }],
    spentHours: 720,
  },
  issues: [
    {
      key: "PORT-231",
      summary: "Login bricht ab",
      status: "In Arbeit",
      updated: "2026-07-22",
      comment: "Kunde meldet weiterhin Fehler.",
    },
  ],
  pages: [{ title: "Statusbericht KW 29", url: "https://x/wiki/1", excerpt: "Budget zu 90 % verbraucht." }],
};

test("buildHealthPrompt enthält Stunden, Tickets, Issues und Confluence", () => {
  const p = buildHealthPrompt(INPUT);
  assert.ok(p.includes("Kundenportal"));
  assert.ok(p.includes("Budgetiert: 800 h · Verbraucht: 720 h (90 %)"));
  assert.ok(p.includes("DB-Ziel: 35 %"));
  assert.ok(p.includes("Gesamt: 120"));
  assert.ok(p.includes("[PORT-231] Login bricht ab (In Arbeit) – Kommentar: Kunde meldet weiterhin Fehler."));
  assert.ok(p.includes("[Statusbericht KW 29]"));
});

test("buildHealthPrompt benennt fehlende Daten", () => {
  const p = buildHealthPrompt({
    ...INPUT,
    budgetHours: null,
    spentHours: null,
    dbTargetPct: null,
    stats: null,
    issues: [],
    pages: [],
  });
  assert.ok(p.includes("Kein Stundenbudget hinterlegt."));
  assert.ok(p.includes("Kein DB-Ziel hinterlegt."));
  assert.ok(!p.includes("## Ticket-Entwicklung"));
});

test("HEALTH_SCHEMA verlangt Ampel, DB-Bewertung und Quellen je Problem", () => {
  assert.ok(HEALTH_SCHEMA.required.includes("status"));
  assert.ok(HEALTH_SCHEMA.required.includes("dbAssessment"));
  assert.ok(HEALTH_SCHEMA.properties.problems.items.required.includes("source"));
});
