"use client";

import { useRef, useState, useTransition } from "react";
import type { CustomerDTO, WorkflowDTO } from "@/components/customer/types";
import { approveWorkflow, handOffToHubspot, toggleTask } from "@/app/actions";
import { fmtDue } from "@/lib/format";
import { PIPELINE_STAGES } from "@/lib/i18n";

// Tab Aufgaben: Opportunity-Pipeline (5 Spalten), Aufgabenliste mit Fälligkeit,
// Workflow-Karte mit Schrittfolge und Freigabe-Block (Kernregel 2: Freigabe ist explizit).

export default function TasksTab({ customer }: { customer: CustomerDTO }) {
  const now = new Date(customer.now);
  const wfRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();
  const [doneOverride, setDoneOverride] = useState<Record<string, boolean>>({});
  const [approved, setApproved] = useState(false);
  const [handedOff, setHandedOff] = useState<Record<string, string>>({});
  const [hubspotError, setHubspotError] = useState<string | null>(null);

  const workflow = customer.tasks.map((t) => t.workflow).find(Boolean) as
    | WorkflowDTO
    | undefined;

  // Aktive Spalte: Stage der zuletzt bearbeiteten offenen Opportunity (gelb unterstrichen)
  const activeStage = customer.opportunities.find(
    (o) => !["won", "dropped"].includes(o.stage)
  )?.stage;

  const isDone = (id: string, status: string) =>
    doneOverride[id] ?? status === "done";

  function toggle(id: string, status: string) {
    setDoneOverride((d) => ({ ...d, [id]: !isDone(id, status) }));
    startTransition(() => toggleTask(id));
  }

  function approve(runId: string) {
    setApproved(true);
    startTransition(() => approveWorkflow(runId));
  }

  function toHubspot(oppId: string) {
    setHubspotError(null);
    startTransition(async () => {
      try {
        const { dealId } = await handOffToHubspot(oppId);
        setHandedOff((h) => ({ ...h, [oppId]: dealId }));
      } catch (e) {
        setHubspotError(e instanceof Error ? e.message : "HubSpot-Übergabe fehlgeschlagen");
      }
    });
  }

  return (
    <div>
      <h3 className="mb-4 text-[1.05rem]">Opportunity-Pipeline</h3>
      <div className="mb-8 flex gap-2.5 overflow-x-auto pb-1">
        {PIPELINE_STAGES.map((stage) => {
          const opps = customer.opportunities.filter((o) => o.stage === stage.key);
          return (
            <div key={stage.key} className="min-w-[170px] flex-1">
              <div
                className={`mb-3 flex justify-between border-b-2 pb-[9px] text-[0.78rem] font-medium uppercase tracking-[0.07em] text-gray-500 ${
                  stage.key === activeStage ? "border-accent" : "border-gray-150"
                }`}
              >
                {stage.label} <span>{opps.length}</span>
              </div>
              {opps.map((o) => (
                <div
                  key={o.id}
                  className={`mb-2.5 rounded-el border border-gray-150 px-3.5 py-3 text-[0.84rem] leading-[1.4] hover:border-ink ${
                    o.stage === "won" ? "opacity-55" : ""
                  }`}
                >
                  {o.title}
                  <div className="mt-[5px] text-[0.74rem] text-gray-500">
                    {o.ownerLabel ? `Verantwortlich: ${o.ownerLabel}` : (o.rationale ?? "")}
                  </div>
                  {/* Etappe 7: qualifizierte Opportunities an HubSpot übergeben (Konzept 4.3) */}
                  {(o.hubspotDealId || handedOff[o.id]) ? (
                    <div className="mt-1.5 text-[0.72rem] font-medium text-pos">
                      ✓ HubSpot-Deal {o.hubspotDealId ?? handedOff[o.id]}
                    </div>
                  ) : (
                    customer.integrations.hubspot &&
                    ["reviewed", "drafting", "placed"].includes(o.stage) && (
                      <button
                        className="mt-1.5 rounded border border-gray-150 px-2 py-0.5 text-[0.72rem] text-gray-700 hover:border-ink"
                        onClick={(e) => {
                          e.stopPropagation();
                          toHubspot(o.id);
                        }}
                      >
                        → An HubSpot übergeben
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {hubspotError && <p className="-mt-4 mb-4 text-[0.82rem] text-neg">{hubspotError}</p>}

      <h3 className="mb-4 text-[1.05rem]">Aufgaben</h3>
      <div className="flex flex-col gap-3">
        {customer.tasks.map((t) => {
          const done = isDone(t.id, t.status);
          const due = t.dueAt ? fmtDue(new Date(t.dueAt), now) : null;
          return (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-4 rounded-card border border-gray-150 px-5 py-4"
            >
              <button
                onClick={() => toggle(t.id, t.status)}
                aria-label={done ? "Aufgabe wieder öffnen" : "Aufgabe erledigen"}
                className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md border-[1.5px] text-[0.8rem] ${
                  done ? "border-ink bg-ink text-paper" : "border-gray-300"
                }`}
              >
                {done ? "✓" : ""}
              </button>
              <div>
                <div
                  className={`text-[0.95rem] font-normal ${done ? "text-gray-500 line-through" : ""}`}
                >
                  {t.title}
                </div>
                <div className="text-[0.78rem] text-gray-500">
                  {t.assigneeName ?? "Nicht zugewiesen"}
                  {t.originLabel ? ` · ${t.originLabel}` : ""}
                </div>
              </div>
              <span
                className={`ml-auto text-[0.78rem] ${
                  !done && due?.overdue ? "font-medium text-neg" : "text-gray-700"
                }`}
              >
                {done ? "–" : (due?.label ?? "")}
              </span>
              {!done &&
                (t.workflow ? (
                  <button
                    className="rounded-md border border-accent bg-accent-soft px-3 py-[5px] text-[0.78rem] text-gray-900"
                    onClick={() => wfRef.current?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Workflow läuft
                  </button>
                ) : (
                  <button
                    className="rounded-md border border-gray-300 px-3 py-[5px] text-[0.78rem] text-gray-900 hover:border-ink"
                    title="Workflow-Framework folgt in Etappe 8"
                  >
                    ▶ Workflow starten
                  </button>
                ))}
            </div>
          );
        })}
        {customer.tasks.length === 0 && (
          <p className="py-8 text-center text-[0.9rem] text-gray-500">Keine Aufgaben.</p>
        )}
      </div>

      {workflow && (
        <div
          ref={wfRef}
          className="mt-8 rounded-card border border-gray-150 border-l-[3px] border-l-accent px-6 py-[22px]"
        >
          <h4 className="mb-1">
            Agentischer Workflow: {workflow.skillName} – {workflow.taskTitle}
          </h4>
          <div className="mb-[18px] text-[0.83rem] text-gray-500">
            Organisations-Workflow „{workflow.skillName}“ · jeder Schritt wird protokolliert
          </div>
          <div className="flex flex-col">
            {workflow.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3.5 py-[9px] text-[0.9rem]">
                <div
                  className={`mt-px flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-[0.72rem] ${
                    s.status === "done"
                      ? "bg-ink text-paper"
                      : s.status === "active" && !approved
                        ? "bg-accent font-semibold text-ink"
                        : approved && s.status === "active"
                          ? "bg-ink text-paper"
                          : "border-[1.5px] border-gray-300 text-gray-300"
                  }`}
                >
                  {s.status === "done" || (approved && s.status === "active") ? "✓" : i + 1}
                </div>
                <div className="text-gray-700">
                  <b className={s.status === "pending" ? "font-normal" : "font-medium text-ink"}>
                    {s.step}
                  </b>
                  {s.note ? ` – ${s.note}` : ""}
                </div>
              </div>
            ))}
          </div>

          {workflow.status === "waiting_approval" && !approved && (
            <div className="mt-[18px] rounded-el bg-gray-75 p-[18px] text-[0.9rem] leading-relaxed">
              <div className="mb-2 text-[0.75rem] font-medium uppercase tracking-[0.07em] text-gray-500">
                Wartet auf deine Freigabe
              </div>
              „{workflow.skillName}: {workflow.taskTitle}“ –{" "}
              {workflow.steps.find((s) => s.status === "active")?.note ?? "Entwurf liegt vor"}.
              Alle Aussagen mit Quellenangabe. Ohne Freigabe verlässt nichts das System.
              <div className="mt-3.5 flex flex-wrap gap-2.5">
                <button
                  className="rounded-el bg-ink px-5 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-gray-900"
                  onClick={() => approve(workflow.id)}
                >
                  Freigeben & fortsetzen
                </button>
                <button
                  className="rounded-el border border-gray-300 px-5 py-2.5 text-[0.9rem] font-medium hover:bg-paper"
                  title="Entwurfsansicht folgt in Etappe 8"
                >
                  Entwurf öffnen
                </button>
                <button
                  className="rounded-el border border-gray-300 px-5 py-2.5 text-[0.9rem] font-medium hover:bg-paper"
                  title="Folgt in Etappe 8"
                >
                  Änderungen anfordern
                </button>
              </div>
            </div>
          )}
          {(workflow.status === "approved" || approved) && (
            <div className="mt-[18px] rounded-el bg-gray-75 p-[18px] text-[0.9rem] leading-relaxed">
              <div className="mb-2 text-[0.75rem] font-medium uppercase tracking-[0.07em] text-pos">
                Freigegeben
              </div>
              Die Folgeschritte werden ausgeführt, sobald das Workflow-Framework (Etappe 8) die
              Anbindungen übernimmt. Der Lauf bleibt vollständig protokolliert.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
