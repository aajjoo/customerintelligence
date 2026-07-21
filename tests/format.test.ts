// Unit-Tests für die reinen Formatierungs-/Berechnungsfunktionen (npm test).
// Läuft ohne Abhängigkeiten über node --experimental-strip-types --test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDue, fmtRelativeDay, fmtKpiValue, kpiDelta, fmtReportMonth } from "../src/lib/format.ts";

const now = new Date("2026-07-21T10:00:00");

test("fmtRelativeDay: heute / gestern / Datum", () => {
  assert.match(fmtRelativeDay(new Date("2026-07-21T06:40:00"), now), /^Heute, 06:40/);
  assert.equal(fmtRelativeDay(new Date("2026-07-20T12:00:00"), now), "Gestern");
  assert.equal(fmtRelativeDay(new Date("2026-07-15T12:00:00"), now), "15. Juli");
});

test("fmtDue: überfällig wird markiert", () => {
  assert.deepEqual(fmtDue(new Date("2026-07-20"), now), { label: "Fällig gestern", overdue: true });
  assert.equal(fmtDue(new Date("2026-07-18"), now).overdue, true);
  assert.deepEqual(fmtDue(new Date("2026-07-24"), now), { label: "Fällig 24. Juli", overdue: false });
  assert.equal(fmtDue(new Date("2026-07-21"), now).overdue, false);
});

test("fmtKpiValue: Einheiten", () => {
  assert.equal(fmtKpiValue(46, "%"), "46 %");
  assert.equal(fmtKpiValue(87, "count"), "87");
  assert.equal(fmtKpiValue(42, "pt"), "42 Pkt.");
});

test("kpiDelta: Richtung bestimmt gute/schlechte Bewegung", () => {
  // Adoption fällt von 50 auf 46, höher wäre besser → negative Bewegung
  const down = kpiDelta([50, 46], "up", "%");
  assert.equal(down.tone, "down");
  assert.match(down.label, /▼ 4 Pkt\./);
  // Dokuzeit sinkt, niedriger ist besser → positive Bewegung
  const good = kpiDelta([40, 35], "down", "%");
  assert.equal(good.tone, "up");
  // stabil
  assert.equal(kpiDelta([31, 31], "up", "%").tone, "flat");
});

test("fmtReportMonth", () => {
  assert.equal(fmtReportMonth("2026-07"), "Juli 2026");
});
