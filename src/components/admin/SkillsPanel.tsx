"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteResearchSkill,
  saveAreaSkill,
  saveResearchSkill,
  saveWorkflowSkill,
} from "@/app/actions";

// Skills (Client): Recherche-Skills (automatische Websuche), Bereichs-Anweisungen
// (wirken auf die AI-Analyse) und Workflow-Skills.

type Area = { key: string; label: string; hint: string; instruction: string };
type ResearchSkill = { id: string; name: string; promptTmpl: string; active: boolean };
type WorkflowSkill = {
  id: string;
  name: string;
  description: string;
  promptTmpl: string;
  outputKind: string;
  active: boolean;
};

const EMPTY: WorkflowSkill = {
  id: "",
  name: "",
  description: "",
  promptTmpl: "",
  outputKind: "briefing",
  active: true,
};

export default function SkillsPanel({
  areas,
  researchSkills,
  workflowSkills,
}: {
  areas: Area[];
  researchSkills: ResearchSkill[];
  workflowSkills: WorkflowSkill[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>(
    Object.fromEntries(areas.map((a) => [a.key, a.instruction]))
  );
  const [editing, setEditing] = useState<WorkflowSkill | null>(null);
  const [editingResearch, setEditingResearch] = useState<ResearchSkill | null>(null);

  const act = (fn: () => Promise<unknown>, success: string) => {
    setMsg(null);
    startTransition(async () => {
      try {
        await fn();
        setMsg(success);
        setEditing(null);
        setEditingResearch(null);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
      }
    });
  };

  return (
    <div className="mt-8 flex flex-col gap-10">
      {msg && <p className="text-[0.85rem] text-gray-700">{msg}</p>}

      {/* ---- Recherche-Skills: automatische Quellensuche ---- */}
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[1.2rem]">Recherche-Skills</h2>
          <button
            className="rounded-el border border-gray-300 px-3 py-1.5 text-[0.85rem] font-medium hover:border-ink"
            onClick={() => setEditingResearch({ id: "", name: "", promptTmpl: "", active: true })}
          >
            + Recherche-Skill
          </button>
        </div>
        <p className="mb-4 max-w-[640px] text-[0.85rem] text-gray-500">
          Steuern die automatische Websuche je Kunde: für jeden aktiven Skill recherchiert Claude
          bei jedem Lauf aktiv im Netz (Kundenprofil + Anweisung) – ohne manuell gepflegte Feeds.
        </p>
        <div className="flex flex-col gap-3">
          {researchSkills.map((s) => (
            <div key={s.id} className="rounded-card border border-gray-150 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`font-medium ${s.active ? "" : "text-gray-500 line-through"}`}>
                  {s.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.82rem] text-gray-500">
                  {s.promptTmpl}
                </span>
                <button
                  className="rounded-el border border-gray-300 px-3 py-1 text-[0.8rem] font-medium hover:border-ink"
                  onClick={() => setEditingResearch({ ...s })}
                >
                  Bearbeiten
                </button>
                <button
                  className="rounded-el border border-gray-300 px-3 py-1 text-[0.8rem] font-medium text-neg hover:border-neg"
                  onClick={() => act(() => deleteResearchSkill(s.id), `${s.name} gelöscht`)}
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
          {researchSkills.length === 0 && (
            <p className="text-[0.85rem] text-gray-500">
              Keine Recherche-Skills – die automatische Websuche ist damit inaktiv.
            </p>
          )}
        </div>

        {editingResearch && (
          <div className="mt-5 rounded-card border border-gray-150 border-l-[3px] border-l-accent p-6">
            <h3 className="mb-4 text-[1.05rem]">
              {editingResearch.id
                ? `Recherche-Skill bearbeiten: ${editingResearch.name}`
                : "Neuer Recherche-Skill"}
            </h3>
            <div className="grid gap-3">
              <input
                className="rounded-el border border-gray-300 px-3 py-2 text-[0.9rem] outline-none focus:border-ink"
                placeholder="Name (z. B. Mitbewerber, Fachmedien, Plattformen)"
                value={editingResearch.name}
                onChange={(e) => setEditingResearch({ ...editingResearch, name: e.target.value })}
              />
              <textarea
                className="h-28 rounded-el border border-gray-300 p-3 text-[0.9rem] leading-relaxed outline-none focus:border-ink"
                placeholder="Recherche-Anweisung: wonach soll gesucht werden? (Kundenprofil wird automatisch mitgegeben)"
                value={editingResearch.promptTmpl}
                onChange={(e) =>
                  setEditingResearch({ ...editingResearch, promptTmpl: e.target.value })
                }
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-[0.85rem] text-gray-700">
                  <input
                    type="checkbox"
                    className="accent-ink"
                    checked={editingResearch.active}
                    onChange={(e) =>
                      setEditingResearch({ ...editingResearch, active: e.target.checked })
                    }
                  />
                  aktiv
                </label>
                <span className="ml-auto flex gap-2">
                  <button
                    className="rounded-el border border-gray-300 px-4 py-2 text-[0.85rem] font-medium"
                    onClick={() => setEditingResearch(null)}
                  >
                    Abbrechen
                  </button>
                  <button
                    className="rounded-el bg-ink px-4 py-2 text-[0.85rem] font-medium text-paper disabled:opacity-50"
                    disabled={pending || !editingResearch.name.trim()}
                    onClick={() =>
                      act(
                        () =>
                          saveResearchSkill({
                            id: editingResearch.id || undefined,
                            name: editingResearch.name,
                            promptTmpl: editingResearch.promptTmpl,
                            active: editingResearch.active,
                          }),
                        "Recherche-Skill gespeichert"
                      )
                    }
                  >
                    Speichern
                  </button>
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ---- Analyse-Anweisungen je Bereich ---- */}
      <section>
        <h2 className="mb-4 text-[1.2rem]">Analyse-Anweisungen je Bereich</h2>
        <div className="grid gap-5 lg:grid-cols-2">
          {areas.map((a) => (
            <div key={a.key} className="rounded-card border border-gray-150 p-5">
              <h3 className="text-[1rem]">{a.label}</h3>
              <p className="mb-3 mt-1 text-[0.8rem] text-gray-500">{a.hint}</p>
              <textarea
                className="h-28 w-full rounded-el border border-gray-150 p-3 text-[0.85rem] leading-relaxed outline-none focus:border-ink"
                value={texts[a.key] ?? ""}
                onChange={(e) => setTexts({ ...texts, [a.key]: e.target.value })}
                placeholder="Keine Anweisung gesetzt – Standardverhalten."
              />
              <div className="mt-2 flex justify-end">
                <button
                  className="rounded-el bg-ink px-3 py-1.5 text-[0.82rem] font-medium text-paper disabled:opacity-50"
                  disabled={pending}
                  onClick={() =>
                    act(() => saveAreaSkill(a.key, texts[a.key] ?? ""), `${a.label} gespeichert`)
                  }
                >
                  Speichern
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Workflow-Skills ---- */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[1.2rem]">Workflow-Skills</h2>
          <button
            className="rounded-el border border-gray-300 px-3 py-1.5 text-[0.85rem] font-medium hover:border-ink"
            onClick={() => setEditing({ ...EMPTY })}
          >
            + Skill anlegen
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {workflowSkills.map((s) => (
            <div key={s.id} className="rounded-card border border-gray-150 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className={`font-medium ${s.active ? "" : "text-gray-500 line-through"}`}>
                  {s.name}
                </span>
                <span className="rounded bg-gray-75 px-2 py-0.5 text-[0.72rem] uppercase tracking-wide text-gray-700">
                  {s.outputKind}
                </span>
                <span className="text-[0.82rem] text-gray-500">{s.description}</span>
                <button
                  className="ml-auto rounded-el border border-gray-300 px-3 py-1 text-[0.8rem] font-medium hover:border-ink"
                  onClick={() => setEditing({ ...s })}
                >
                  Bearbeiten
                </button>
              </div>
            </div>
          ))}
        </div>

        {editing && (
          <div className="mt-5 rounded-card border border-gray-150 border-l-[3px] border-l-accent p-6">
            <h3 className="mb-4 text-[1.05rem]">
              {editing.id ? `Skill bearbeiten: ${editing.name}` : "Neuen Skill anlegen"}
            </h3>
            <div className="grid gap-3">
              <input
                className="rounded-el border border-gray-300 px-3 py-2 text-[0.9rem] outline-none focus:border-ink"
                placeholder="Name (z. B. Angebots-Skizze)"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <input
                className="rounded-el border border-gray-300 px-3 py-2 text-[0.9rem] outline-none focus:border-ink"
                placeholder="Beschreibung (erscheint in der Skill-Auswahl)"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <textarea
                className="h-32 rounded-el border border-gray-300 p-3 text-[0.9rem] leading-relaxed outline-none focus:border-ink"
                placeholder="Prompt-Anweisung: was soll aus dem Radar-Material erstellt werden?"
                value={editing.promptTmpl}
                onChange={(e) => setEditing({ ...editing, promptTmpl: e.target.value })}
              />
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-[0.85rem] text-gray-700">
                  Output:
                  <select
                    className="rounded-el border border-gray-300 bg-paper px-2 py-1 text-[0.85rem]"
                    value={editing.outputKind}
                    onChange={(e) => setEditing({ ...editing, outputKind: e.target.value })}
                  >
                    <option value="briefing">Briefing</option>
                    <option value="report">Report</option>
                    <option value="email">E-Mail</option>
                    <option value="table">Tabelle</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-[0.85rem] text-gray-700">
                  <input
                    type="checkbox"
                    className="accent-ink"
                    checked={editing.active}
                    onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                  />
                  aktiv
                </label>
                <span className="ml-auto flex gap-2">
                  <button
                    className="rounded-el border border-gray-300 px-4 py-2 text-[0.85rem] font-medium"
                    onClick={() => setEditing(null)}
                  >
                    Abbrechen
                  </button>
                  <button
                    className="rounded-el bg-ink px-4 py-2 text-[0.85rem] font-medium text-paper disabled:opacity-50"
                    disabled={pending || !editing.name.trim()}
                    onClick={() =>
                      act(
                        () =>
                          saveWorkflowSkill({
                            id: editing.id || undefined,
                            name: editing.name,
                            description: editing.description,
                            promptTmpl: editing.promptTmpl,
                            outputKind: editing.outputKind,
                            active: editing.active,
                          }),
                        "Skill gespeichert"
                      )
                    }
                  >
                    Speichern
                  </button>
                </span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
