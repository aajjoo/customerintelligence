// Tests für Berichtgenerierung, PDF-Helper und Aufgaben-Erinnerung/Eskalation (Etappe 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportInput } from "../src/lib/report/input.ts";
import { sanitizeForPdf, wrapText } from "../src/lib/report/pdf.ts";
import { checkTask, overdueDays, ESCALATION_DAYS } from "../src/lib/pipeline/taskcheck.ts";

// ---------- Bericht-Input ----------

test("buildReportInput: Signale sortiert mit Quelle, KPIs mit Verlauf, Vormonat", () => {
  const input = buildReportInput({
    name: "AlpenStahl AG",
    month: "2026-07",
    signals: [
      { dimension: "markt", title: "B", summary: "s", sourceLabel: "Quelle B", relevance: 50, review: "open" },
      { dimension: "mitbewerb", title: "A", summary: "s", sourceLabel: "Quelle A", relevance: 90, review: "relevant" },
      { dimension: "kunde", title: "C", summary: "s", sourceLabel: null, relevance: 99, review: "irrelevant" },
    ],
    projects: [
      {
        name: "Portal", status: "watch", phase: "Rollout",
        kpis: [{ label: "Adoption", unit: "%", values: [50, 46], target: 65, threshold: 50 }],
      },
    ],
    opportunities: [{ title: "Opp", stage: "placed", rationale: "Bezug X" }],
    tasks: [
      { title: "T1", status: "done", overdue: false },
      { title: "T2", status: "open", overdue: true },
    ],
    prevExecSummary: "Vormonat war ruhig.",
  });

  assert.match(input, /\[Mitbewerb\] A \(Relevanz 90, Quelle: Quelle A\)/);
  assert.ok(input.indexOf("[Mitbewerb] A") < input.indexOf("[Markt & Branche] B"), "nach Relevanz sortiert");
  assert.ok(!input.includes("] C"), "irrelevante Signale bleiben draußen");
  assert.match(input, /Adoption: 50 % → 46 % \(Ziel 65 %, Schwelle 50 %\)/);
  assert.match(input, /Opp · Beim Kunden · Bezug X/);
  assert.match(input, /1 erledigt, 1 offen, davon 1 überfällig/);
  assert.match(input, /Vormonat war ruhig\./);
});

test("buildReportInput: leere Daten ergeben 'keine'-Platzhalter", () => {
  const input = buildReportInput({
    name: "X", month: "2026-07", signals: [], projects: [], opportunities: [], tasks: [],
    prevExecSummary: null,
  });
  assert.match(input, /## Signale des Monats \(KI-bewertet, mit Quellen\)\nkeine/);
  assert.match(input, /kein Vorbericht vorhanden/);
});

// ---------- PDF-Helper ----------

// Font-Mock: Breite proportional zur Zeichenzahl
const mockFont = { widthOfTextAtSize: (t: string, size: number) => t.length * size * 0.5 };

test("wrapText: bricht an Wortgrenzen, respektiert maxWidth", () => {
  const lines = wrapText("eins zwei drei vier fuenf", mockFont, 10, 60);
  // 60 / (10*0.5) = 12 Zeichen je Zeile
  assert.ok(lines.every((l) => l.length <= 12), JSON.stringify(lines));
  assert.equal(lines.join(" "), "eins zwei drei vier fuenf");
});

test("wrapText: überlange Wörter werden hart getrennt, Absätze bleiben", () => {
  const lines = wrapText("Donaudampfschifffahrt\nkurz", mockFont, 10, 50);
  assert.ok(lines.length >= 3);
  assert.equal(lines[lines.length - 1], "kurz");
  assert.equal(lines.slice(0, -1).join(""), "Donaudampfschifffahrt");
});

test("sanitizeForPdf: typografische Zeichen → WinAnsi-tauglich", () => {
  assert.equal(sanitizeForPdf("„Test“ – 50 % → Ziel …"), '"Test" - 50 % -> Ziel ...');
  assert.equal(sanitizeForPdf("Umlaute äöüß bleiben"), "Umlaute äöüß bleiben");
});

// ---------- Erinnerung / Eskalation ----------

const NOW = new Date("2026-07-22T10:00:00");
const task = (dueAt: string | null, status = "open") => ({
  taskId: "t1", title: "Follow-up senden", status, dueAt: dueAt ? new Date(dueAt) : null,
  assigneeName: "Lena Huber",
});

test("overdueDays: volle Tage seit Fälligkeit", () => {
  assert.equal(overdueDays(new Date("2026-07-22"), NOW), 0);
  assert.equal(overdueDays(new Date("2026-07-21"), NOW), 1);
  assert.equal(overdueDays(new Date("2026-07-19"), NOW), 3);
});

test("checkTask: heute fällig → nichts, 1-2 Tage → Erinnerung, ab 3 → Eskalation", () => {
  assert.equal(checkTask(task("2026-07-22"), NOW), null);
  const reminder = checkTask(task("2026-07-21"), NOW);
  assert.equal(reminder?.kind, "reminder");
  assert.equal(reminder?.contentHash, "task:t1:reminder");
  assert.match(reminder!.summary, /Lena Huber/);
  const escalation = checkTask(task("2026-07-19"), NOW);
  assert.equal(escalation?.kind, "escalation");
  assert.equal(escalation?.contentHash, "task:t1:escalation");
  assert.match(escalation!.summary, new RegExp(`seit ${ESCALATION_DAYS} Tagen`));
});

test("checkTask: erledigte oder terminlose Aufgaben → nichts", () => {
  assert.equal(checkTask(task("2026-07-10", "done"), NOW), null);
  assert.equal(checkTask(task(null), NOW), null);
});
