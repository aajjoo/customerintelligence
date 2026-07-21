"use client";

import { useState, useTransition } from "react";
import type { CustomerDTO } from "@/components/customer/types";
import { approveReport } from "@/app/actions";
import { fmtKpiValue, fmtReportMonth, kpiDelta } from "@/lib/format";
import { dimensionLabel, PROJECT_STATUS } from "@/lib/i18n";

// Tab Bericht: Monatsbericht mit Executive Summary (aus der DB) und Abschnitten,
// die aus den Seed-Daten berechnet werden. Freigabe durch den Account Lead;
// Generierung + PDF-Export folgen in Etappe 5.

export default function ReportTab({ customer }: { customer: CustomerDTO }) {
  const [, startTransition] = useTransition();
  const [approvedLocal, setApprovedLocal] = useState(false);
  const report = customer.report;

  if (!report) {
    return (
      <p className="py-8 text-[0.9rem] text-gray-500">
        Für diesen Kunden liegt noch kein Monatsbericht vor. Die automatische Berichtgenerierung
        folgt in Etappe 5.
      </p>
    );
  }

  const approved = report.status === "approved" || approvedLocal;
  const now = new Date(customer.now);

  const topSignals = customer.signals
    .filter((s) => s.review !== "irrelevant")
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

  const openOpps = customer.opportunities.filter((o) => !["won", "dropped"].includes(o.stage));
  const placed = openOpps.filter((o) => o.stage === "placed").length;
  const openTasks = customer.tasks.filter((t) => t.status === "open");
  const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now).length;
  const doneTasks = customer.tasks.filter((t) => t.status === "done").length;

  function approve() {
    setApprovedLocal(true);
    startTransition(() => approveReport(report!.id));
  }

  return (
    <div className="max-w-[760px]">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-[18px]">
        <div>
          <div className="mb-2 text-[0.78rem] font-medium uppercase tracking-[0.09em] text-gray-500">
            Monatsbericht
          </div>
          <h2 className="text-[1.6rem]">
            {customer.name} · {fmtReportMonth(report.month)}
          </h2>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2 text-[0.82rem] text-gray-500">
            <span
              className={`rounded-md px-2.5 py-[3px] text-[0.76rem] font-medium ${
                approved ? "bg-gray-75 text-pos" : "bg-accent-soft text-gray-900"
              }`}
            >
              {approved ? "Freigegeben" : "Entwurf – Freigabe ausstehend"}
            </span>
          </div>
          <div className="mt-2.5 flex justify-end gap-2">
            {!approved && (
              <button
                className="rounded-el bg-ink px-5 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-gray-900"
                onClick={approve}
              >
                Freigeben
              </button>
            )}
            <button
              className="rounded-el border border-gray-300 px-5 py-2.5 text-[0.9rem] font-medium text-gray-500"
              title="PDF-Export folgt in Etappe 5"
            >
              PDF exportieren
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-card bg-gray-75 px-[26px] py-[22px] text-[0.97rem] leading-[1.65]">
        <b className="font-medium">Executive Summary.</b> {report.execSummary}
      </div>

      <h3 className="mb-2.5 mt-[26px] text-[1.05rem]">Wichtigste Signale</h3>
      <p className="mb-3 text-[0.94rem] leading-[1.65] text-gray-700">
        {topSignals.map((s) => (
          <span key={s.id}>
            <b className="font-medium">{dimensionLabel(s.dimension)}.</b> {s.title}
            {s.sourceLabel ? ` (Quelle: ${s.sourceLabel})` : ""}.{" "}
          </span>
        ))}
        {topSignals.length === 0 && "Keine Signale in diesem Zeitraum."}
      </p>

      <h3 className="mb-2.5 mt-[26px] text-[1.05rem]">Projekte & KPIs</h3>
      <p className="mb-3 text-[0.94rem] leading-[1.65] text-gray-700">
        {customer.projects.map((p, i) => {
          const kpiParts = p.kpis
            .filter((k) => k.values.length > 0)
            .map((k) => {
              const delta = kpiDelta(k.values.map((v) => v.value), k.direction, k.unit);
              const arrow = delta.label.startsWith("▲") ? " (▲)" : delta.label.startsWith("▼") ? " (▼)" : "";
              return `${k.label} ${fmtKpiValue(k.values[k.values.length - 1].value, k.unit)}${arrow}`;
            })
            .join(", ");
          return (
            <span key={p.id}>
              <b className="font-medium">{p.name}:</b>{" "}
              {(PROJECT_STATUS[p.status] ?? PROJECT_STATUS.ok).label}
              {kpiParts ? `, ${kpiParts}` : ""}.{i < customer.projects.length - 1 ? " " : ""}
            </span>
          );
        })}
        {customer.projects.length === 0 && "Keine laufenden Projekte."}
      </p>

      <h3 className="mb-2.5 mt-[26px] text-[1.05rem]">Opportunities & Aufgaben</h3>
      <p className="mb-3 text-[0.94rem] leading-[1.65] text-gray-700">
        {openOpps.length} offene Opportunit{openOpps.length === 1 ? "y" : "ies"}
        {placed > 0 ? `, davon ${placed} beim Kunden` : ""}. Aufgabenstand: {openTasks.length}{" "}
        offen{overdueTasks > 0 ? `, ${overdueTasks} überfällig` : ""}, {doneTasks} erledigt.
      </p>
    </div>
  );
}
