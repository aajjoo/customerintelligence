// Tests für den Chat-Prompt-Aufbau (Etappe 6) – rein, ohne DB/API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChatPrompt, CHAT_SCHEMA } from "../src/lib/chat/prompt.ts";

test("buildChatPrompt: nummerierter Kontext mit Quellen, Frage, Regeln", () => {
  const prompt = buildChatPrompt(
    "AlpenStahl AG",
    [
      { kind: "signal", text: "Ferrotec kündigt Portal an", source: "Pressemitteilung Ferrotec" },
      { kind: "projekt", text: "Kundenportal 2.0 – Beobachten", source: "Projekt Kundenportal 2.0" },
    ],
    "Was macht Ferrotec?"
  );
  assert.match(prompt, /\[1\] \(signal · Quelle: Pressemitteilung Ferrotec\) Ferrotec kündigt Portal an/);
  assert.match(prompt, /\[2\] \(projekt · Quelle: Projekt Kundenportal 2\.0\)/);
  assert.match(prompt, /## Frage\nWas macht Ferrotec\?/);
  assert.match(prompt, /ohne Quelle keine Aussage/);
});

test("buildChatPrompt: ohne Material expliziter Hinweis", () => {
  const prompt = buildChatPrompt("X", [], "Frage?");
  assert.match(prompt, /kein Material vorhanden/);
});

test("CHAT_SCHEMA: verlangt answer und sources", () => {
  assert.deepEqual(CHAT_SCHEMA.required, ["answer", "sources"]);
  assert.equal(CHAT_SCHEMA.properties.sources.type, "array");
});
