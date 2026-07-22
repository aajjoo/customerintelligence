"use client";

import { useState, useTransition } from "react";
import ChartCanvas from "@/components/ChartCanvas";
import type { CustomerDTO, KpiDTO } from "@/components/customer/types";
import { importKpiValues } from "@/app/actions";
import { fmtKpiValue, kpiDelta } from "@/lib/format";
import { PROJECT_STATUS } from "@/lib/i18n";

// Tab Projekte & KPIs: Projektkarten mit Status-LED (immer mit Textlabel,
// Barrierefreiheit laut Spec), KPI-Kacheln, KPI-Verläufe mit Ziel- und Schwellenlinie.

export default function ProjectsTab({ customer }: { customer: CustomerDTO }) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-gray-500">
          {customer.projects.length} laufende Projekte
          {customer.projects.some((p) => p.externalRef) ? " · Referenzen aus Jira" : ""}
        </p>
        <button
          className="rounded-el border border-gray-300 px-5 py-2.5 text-[0.9rem] font-medium text-gray-500"
          title="Jira-/Projektsoftware-Sync folgt in Etappe 7"
        >
          + Projekt übernehmen
        </button>
      </div>

      <div className="flex flex-col gap-[22px]">
        {customer.projects.map((p) => {
          const status = PROJECT_STATUS[p.status] ?? PROJECT_STATUS.ok;
          const chartKpis = p.kpis.filter((k) => k.values.length >= 3);
          return (
            <div key={p.id} className="rounded-card border border-gray-150 p-6">
              <div className="mb-1 flex flex-wrap items-center gap-3.5">
                <h3 className="text-[1.2rem]">{p.name}</h3>
                <span className="inline-flex items-center gap-[7px] text-[0.82rem] text-gray-700">
                  <span className={`h-[9px] w-[9px] rounded-full ${status.led}`} />
                  Status: {status.label}
                </span>
                {p.phase && (
                  <span className="ml-auto text-[0.82rem] text-gray-500">Phase: {p.phase}</span>
                )}
              </div>
              {p.description && (
                <div className="mb-5 mt-2 max-w-[720px] text-[0.9rem] leading-normal text-gray-700">
                  {p.description}
                </div>
              )}

              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
                {p.kpis.map((k) => (
                  <KpiTile key={k.id} kpi={k} />
                ))}
              </div>

              {chartKpis.length > 0 && (
                <div className="mt-[22px] grid gap-6 md:grid-cols-2">
                  {chartKpis.map((k) => (
                    <KpiChart key={k.id} kpi={k} />
                  ))}
                </div>
              )}

              <div className="mt-5 flex items-center gap-4 text-[0.85rem] text-gray-700">
                {p.externalRef && (
                  <span>
                    Jira: <b className="font-medium text-ink">{p.externalRef}</b>
                  </span>
                )}
                {p.kpis.length > 0 && <KpiImport projectId={p.id} />}
              </div>
            </div>
          );
        })}
        {customer.projects.length === 0 && (
          <p className="py-8 text-center text-[0.9rem] text-gray-500">Noch keine Projekte.</p>
        )}
      </div>
    </div>
  );
}

/** Etappe 7: KPI-Werte per CSV importieren (kpi;periode;wert, Periode YYYY-MM). */
function KpiImport({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setMsg(null);
    startTransition(async () => {
      try {
        const result = await importKpiValues(projectId, csv);
        setMsg(
          `${result.imported} Wert${result.imported === 1 ? "" : "e"} importiert` +
            (result.errors.length > 0 ? ` · ${result.errors[0]}` : "")
        );
        if (result.errors.length === 0) setCsv("");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Import fehlgeschlagen");
      }
    });
  }

  return (
    <span className="relative">
      <button
        className="rounded border border-gray-150 px-2.5 py-1 text-[0.78rem] text-gray-700 hover:border-ink"
        onClick={() => setOpen(!open)}
      >
        KPI-Import
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-10 w-[340px] rounded-card border border-gray-150 bg-paper p-4 shadow-lg">
          <div className="mb-2 text-[0.78rem] text-gray-500">
            Format: <code>kpi;periode;wert</code> – z. B. <code>Portal-Adoption;2026-08;51</code>
          </div>
          <textarea
            className="h-24 w-full rounded-el border border-gray-150 p-2 font-mono text-[0.78rem] outline-none focus:border-ink"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"Portal-Adoption;2026-08;51\nTicket-Deflection;2026-08;34"}
          />
          {msg && <p className="mt-1 text-[0.75rem] text-gray-700">{msg}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded-el border border-gray-300 px-3 py-1.5 text-[0.8rem] font-medium"
              onClick={() => setOpen(false)}
            >
              Schließen
            </button>
            <button
              className="rounded-el bg-ink px-3 py-1.5 text-[0.8rem] font-medium text-paper disabled:opacity-50"
              onClick={run}
              disabled={pending || !csv.trim()}
            >
              {pending ? "Importiere …" : "Importieren"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

function KpiTile({ kpi }: { kpi: KpiDTO }) {
  const latest = kpi.values[kpi.values.length - 1];
  if (!latest) return null;
  const delta = kpiDelta(kpi.values.map((v) => v.value), kpi.direction, kpi.unit);
  const toneCls =
    delta.tone === "up" ? "text-pos" : delta.tone === "down" ? "text-neg" : "text-gray-500";
  const targetLine = [
    kpi.target != null ? `Ziel ${fmtKpiValue(kpi.target, kpi.unit)}` : null,
    kpi.threshold != null ? `Schwelle ${fmtKpiValue(kpi.threshold, kpi.unit)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-el bg-gray-75 px-[18px] py-4">
      <div className="mb-1.5 text-[0.78rem] text-gray-500">{kpi.label}</div>
      <div className="text-[1.65rem] font-medium leading-none tracking-[-0.02em]">
        {fmtKpiValue(latest.value, kpi.unit)}
      </div>
      <div className={`mt-1.5 text-[0.8rem] font-normal ${toneCls}`}>{delta.label}</div>
      {targetLine && <div className="mt-[3px] text-[0.72rem] text-gray-500">{targetLine}</div>}
    </div>
  );
}

function KpiChart({ kpi }: { kpi: KpiDTO }) {
  const labels = kpi.values.map((v) => v.label);
  const datasets: any[] = [
    {
      label: kpi.label,
      data: kpi.values.map((v) => v.value),
      borderColor: "#0A0A0A",
      backgroundColor: "#0A0A0A",
      pointRadius: 3,
      tension: 0.35,
    },
  ];
  if (kpi.target != null)
    datasets.push({
      label: "Ziel",
      data: labels.map(() => kpi.target),
      borderColor: "#B8B8B4",
      borderDash: [5, 4],
      pointRadius: 0,
    });
  if (kpi.threshold != null)
    datasets.push({
      label: "Schwelle",
      data: labels.map(() => kpi.threshold),
      borderColor: "#F1BB1E",
      borderDash: [2, 3],
      pointRadius: 0,
    });

  return (
    <div className="rounded-el border border-gray-150 p-4">
      <div className="mb-2.5 text-[0.82rem] text-gray-500">
        {kpi.label}
        {kpi.target != null ? " vs. Ziel" : ""}, {kpi.values.length} Monate
      </div>
      <div className="h-[160px]">
        <ChartCanvas
          config={{
            type: "line",
            data: { labels, datasets },
            options: {
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { display: false } },
                y: {
                  grid: { color: "#F4F4F1" },
                  ticks:
                    kpi.unit === "%" ? { callback: (v: unknown) => `${v} %` } : undefined,
                },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
