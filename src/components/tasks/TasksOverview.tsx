"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleTask } from "@/app/actions";
import { fmtDue } from "@/lib/format";

// Aufgaben-Übersicht (Client): Gruppen Überfällig / Anstehend / Ohne Fälligkeit /
// Erledigt; Abhaken direkt in der Liste, Kunde verlinkt auf den Aufgaben-Tab
// (dort: Workflows starten und freigeben).

type TaskDTO = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  originLabel: string | null;
  assigneeName: string | null;
  customerName: string;
  customerSlug: string;
  workflowStatus: string | null;
};

type WaitingDTO = {
  id: string;
  skillName: string;
  taskTitle: string;
  customerName: string;
  customerSlug: string;
};

const WORKFLOW_LABELS: Record<string, string> = {
  running: "Workflow läuft",
  waiting_approval: "Wartet auf Freigabe",
  approved: "Workflow freigegeben",
  done: "Workflow abgeschlossen",
  failed: "Workflow fehlgeschlagen",
};

export default function TasksOverview({
  open,
  done,
  waiting,
  now,
}: {
  open: TaskDTO[];
  done: TaskDTO[];
  waiting: WaitingDTO[];
  now: string;
}) {
  const nowDate = new Date(now);
  const [, startTransition] = useTransition();
  const [doneOverride, setDoneOverride] = useState<Record<string, boolean>>({});

  const isDone = (t: TaskDTO) => doneOverride[t.id] ?? t.status === "done";

  function toggle(t: TaskDTO) {
    setDoneOverride((d) => ({ ...d, [t.id]: !isDone(t) }));
    startTransition(() => toggleTask(t.id));
  }

  const due = (t: TaskDTO) => (t.dueAt ? fmtDue(new Date(t.dueAt), nowDate) : null);
  const overdue = open.filter((t) => due(t)?.overdue);
  const upcoming = open
    .filter((t) => t.dueAt && !due(t)?.overdue)
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1));
  const noDue = open.filter((t) => !t.dueAt);

  const groups: { title: string; tasks: TaskDTO[]; empty?: string }[] = [
    { title: `Überfällig (${overdue.length})`, tasks: overdue },
    { title: `Anstehend (${upcoming.length})`, tasks: upcoming },
    { title: `Ohne Fälligkeit (${noDue.length})`, tasks: noDue },
  ];

  const row = (t: TaskDTO) => {
    const d = due(t);
    const checked = isDone(t);
    return (
      <div
        key={t.id}
        className="flex flex-wrap items-center gap-4 rounded-card border border-gray-150 px-5 py-4"
      >
        <button
          onClick={() => toggle(t)}
          aria-label={checked ? "Aufgabe wieder öffnen" : "Aufgabe erledigen"}
          className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md border-[1.5px] text-[0.8rem] ${
            checked ? "border-ink bg-ink text-paper" : "border-gray-300"
          }`}
        >
          {checked ? "✓" : ""}
        </button>
        <div className="min-w-0">
          <div className={`text-[0.95rem] ${checked ? "text-gray-500 line-through" : ""}`}>
            {t.title}
          </div>
          <div className="text-[0.78rem] text-gray-500">
            <Link
              href={`/kunden/${t.customerSlug}?tab=aufgaben`}
              className="font-medium text-gray-700 hover:text-ink"
            >
              {t.customerName}
            </Link>
            {" · "}
            {t.assigneeName ?? "Nicht zugewiesen"}
            {t.originLabel ? ` · ${t.originLabel}` : ""}
          </div>
        </div>
        {t.workflowStatus && !checked && (
          <Link
            href={`/kunden/${t.customerSlug}?tab=aufgaben`}
            className="rounded-md border border-accent bg-accent-soft px-3 py-[5px] text-[0.78rem] text-gray-900"
          >
            {WORKFLOW_LABELS[t.workflowStatus] ?? "Workflow"}
          </Link>
        )}
        <span
          className={`ml-auto text-[0.78rem] ${
            !checked && d?.overdue ? "font-medium text-neg" : "text-gray-700"
          }`}
        >
          {checked ? "–" : (d?.label ?? "")}
        </span>
      </div>
    );
  };

  return (
    <div className="mt-8 flex flex-col gap-10">
      {/* Workflows, die auf menschliche Freigabe warten (Kernregel 2) */}
      {waiting.length > 0 && (
        <section>
          <h2 className="mb-4 text-[1.2rem]">Wartet auf Freigabe ({waiting.length})</h2>
          <div className="flex flex-col gap-3">
            {waiting.map((w) => (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-4 rounded-card border border-gray-150 border-l-[3px] border-l-accent px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="text-[0.95rem]">
                    {w.skillName}: {w.taskTitle}
                  </div>
                  <div className="text-[0.78rem] text-gray-500">
                    {w.customerName} · Entwurf liegt vor, Ausspielung erst nach Freigabe
                  </div>
                </div>
                <Link
                  href={`/kunden/${w.customerSlug}?tab=aufgaben`}
                  className="ml-auto rounded-el bg-ink px-4 py-2 text-[0.82rem] font-medium text-paper hover:bg-gray-900"
                >
                  Prüfen & freigeben
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-4 text-[1.2rem]">{g.title}</h2>
          <div className="flex flex-col gap-3">
            {g.tasks.map(row)}
            {g.tasks.length === 0 && (
              <p className="text-[0.85rem] text-gray-500">Keine Aufgaben in dieser Gruppe.</p>
            )}
          </div>
        </section>
      ))}

      <section>
        <h2 className="mb-4 text-[1.2rem]">Zuletzt erledigt</h2>
        <div className="flex flex-col gap-3">
          {done.map(row)}
          {done.length === 0 && (
            <p className="text-[0.85rem] text-gray-500">
              Noch nichts erledigt in den letzten 14 Tagen.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
