// Tests für die Integrations-Logik (Etappe 7) – reine Funktionen ohne Netz/DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRunSummary } from "../src/lib/integrations/slack.ts";
import { parseKpiCsv } from "../src/lib/integrations/kpi-import.ts";

// ---------- Slack-Zusammenfassung ----------

test("formatRunSummary: nur Kunden mit Neuigkeiten, korrekte Pluralformen", () => {
  const text = formatRunSummary([
    { customer: "AlpenStahl AG", created: 3, kpiSignals: 1, taskSignals: 2, errors: [] },
    { customer: "Ruhig GmbH", created: 0, kpiSignals: 0, taskSignals: 0, errors: [] },
    { customer: "Fehler AG", created: 0, kpiSignals: 0, taskSignals: 0, errors: ["Feed kaputt"] },
  ]);
  assert.ok(text);
  assert.match(text!, /\*AlpenStahl AG\*: 3 neue Signale, 1 KPI-Abweichung, 2 überfällige Aufgaben/);
  assert.match(text!, /\*Fehler AG\*: 1 Fehler/);
  assert.ok(!text!.includes("Ruhig GmbH"), "Kunden ohne Neuigkeiten bleiben draußen");
});

test("formatRunSummary: nichts Berichtenswertes → null (keine leere Slack-Nachricht)", () => {
  assert.equal(
    formatRunSummary([{ customer: "X", created: 0, kpiSignals: 0, taskSignals: 0, errors: [] }]),
    null
  );
});

// ---------- KPI-CSV-Import ----------

test("parseKpiCsv: Semikolon/Komma, Kopfzeile, Dezimalkomma", () => {
  const { rows, errors } = parseKpiCsv(
    "kpi;periode;wert\nPortal-Adoption;2026-08;51\nTicket-Deflection;2026-08;34,5"
  );
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kpiLabel, "Portal-Adoption");
  assert.equal(rows[0].period.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(rows[0].value, 51);
  assert.equal(rows[1].value, 34.5, "Dezimalkomma wird akzeptiert");
});

test("parseKpiCsv: fehlerhafte Zeilen werden gemeldet, gute importiert", () => {
  const { rows, errors } = parseKpiCsv(
    "Adoption;2026-13-01;50\nAdoption;August;50\nAdoption;2026-08;abc\nAdoption;2026-08;50"
  );
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /nicht im Format YYYY-MM/);
  assert.match(errors[2], /keine Zahl/);
});
