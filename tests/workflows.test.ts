// Tests für das Workflow-Framework (Etappe 8) – reine Schritt-/Prompt-Logik.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkflowPrompt,
  initialSteps,
  stepsAfterApproval,
  stepsAfterDraft,
} from "../src/lib/workflows/engine.ts";

test("Schrittfolge: Start → Entwurf → Freigabe → Ausspielung", () => {
  const start = initialSteps();
  assert.equal(start.length, 4);
  assert.equal(start[0].status, "active");
  assert.ok(start.slice(1).every((s) => s.status === "pending"));

  const drafted = stepsAfterDraft(17, 2400);
  assert.equal(drafted[0].status, "done");
  assert.match(drafted[0].note!, /17 Einträge/);
  assert.equal(drafted[2].status, "active", "wartet auf menschliche Freigabe");
  assert.equal(drafted[3].status, "pending", "Externes bleibt pending (Kernregel 2)");

  const posted = stepsAfterApproval("posted");
  assert.ok(posted.every((s) => s.status === "done"));
  assert.match(posted[3].note!, /in Slack gepostet/);
  assert.match(stepsAfterApproval("skipped")[3].note!, /übersprungen/);
});

test("buildWorkflowPrompt: Skill-Template, Aufgabe, nummeriertes Material mit Quellen", () => {
  const prompt = buildWorkflowPrompt(
    {
      name: "Meeting-Briefing",
      description: null,
      promptTmpl: "Erstelle ein kompaktes Meeting-Briefing.",
      outputKind: "briefing",
    },
    "AlpenStahl AG",
    "Kurzbriefing für Termin am 28. Juli vorbereiten",
    [{ kind: "signal", text: "Ferrotec kündigt Portal an", source: "Pressemitteilung Ferrotec" }]
  );
  assert.match(prompt, /^Erstelle ein kompaktes Meeting-Briefing\./);
  assert.match(prompt, /## Aufgabe\nKurzbriefing für Termin am 28\. Juli vorbereiten/);
  assert.match(prompt, /\[1\] \(signal · Quelle: Pressemitteilung Ferrotec\)/);
  assert.match(prompt, /jede faktische Aussage mit \(Quelle: …\)/);
});

test("buildWorkflowPrompt: ohne Template Fallback auf outputKind", () => {
  const prompt = buildWorkflowPrompt(
    { name: "X", description: null, promptTmpl: null, outputKind: "email" },
    "K", "T", []
  );
  assert.match(prompt, /Arbeitsdokument der Art "email"/);
  assert.match(prompt, /kein Material vorhanden/);
});
