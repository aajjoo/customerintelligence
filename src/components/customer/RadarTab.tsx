"use client";

import { useMemo, useState, useTransition } from "react";
import ChartCanvas from "@/components/ChartCanvas";
import type { CustomerDTO, SignalDTO, TabKey } from "@/components/customer/types";
import {
  reviewSignal,
  runPipelineForCustomer,
  signalToOpportunity,
  signalToTask,
} from "@/app/actions";
import { fmtDay, fmtRelativeDay } from "@/lib/format";
import { DIMENSIONS, dimensionLabel } from "@/lib/i18n";

// Tab Radar: Dimension-Chips als Filter (inkl. Review-Queue "Zu prüfen"),
// Signalliste als Review-Inbox, Seitenpanel mit Signalvolumen, Radar-Lage,
// Mitbewerbern und manuellem Pipeline-Abruf (Etappe 3).

export default function RadarTab({
  customer,
  onShowTab,
}: {
  customer: CustomerDTO;
  onShowTab: (t: TabKey) => void;
}) {
  const [dim, setDim] = useState<string>("all");
  // Optimistischer UI-Zustand: Bewertetes verliert die Neu-Markierung, Irrelevantes verschwindet.
  const [reviewed, setReviewed] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null);
  const [pipelineRunning, startPipeline] = useTransition();

  const now = new Date(customer.now);
  const signals = useMemo(
    () =>
      customer.signals.filter(
        (s) => s.review !== "irrelevant" && reviewed[s.id] !== "irrelevant"
      ),
    [customer.signals, reviewed]
  );
  const visible = signals.filter((s) => {
    if (dim === "queue") return s.review === "open" && !reviewed[s.id];
    return dim === "all" || s.dimension === dim;
  });

  const dims = DIMENSIONS.map((d) => ({
    ...d,
    count: signals.filter((s) => s.dimension === d.key).length,
  })).filter((d) => d.count > 0);

  const isNew = (s: SignalDTO) => s.isNew && !reviewed[s.id];
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const nextReport = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const openOpps = customer.opportunities.filter(
    (o) => !["won", "dropped"].includes(o.stage)
  ).length;
  const reviewQueue = signals.filter((s) => s.review === "open" && !reviewed[s.id]).length;

  function review(id: string, verdict: "relevant" | "irrelevant") {
    setReviewed((r) => ({ ...r, [id]: verdict }));
    startTransition(() => reviewSignal(id, verdict));
  }
  function toOpportunity(id: string) {
    setReviewed((r) => ({ ...r, [id]: "relevant" }));
    startTransition(() => signalToOpportunity(id));
  }
  function toTask(id: string) {
    setReviewed((r) => ({ ...r, [id]: "relevant" }));
    startTransition(() => signalToTask(id));
  }

  function triggerPipeline() {
    setPipelineMsg(null);
    startPipeline(async () => {
      try {
        const result = await runPipelineForCustomer(customer.id);
        setPipelineMsg(
          result.errors.length > 0
            ? `Fehler: ${result.errors[0]}`
            : `${result.fetched} Items geholt, ${result.created + result.kpiSignals} neue Signale`
        );
      } catch (e) {
        setPipelineMsg(e instanceof Error ? e.message : "Pipeline-Lauf fehlgeschlagen");
      }
    });
  }

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-center gap-2">
        <Chip active={dim === "all"} onClick={() => setDim("all")} label="Alle" count={signals.length} />
        <Chip
          active={dim === "queue"}
          onClick={() => setDim("queue")}
          label="Zu prüfen"
          count={reviewQueue}
        />
        {dims.map((d) => (
          <Chip
            key={d.key}
            active={dim === d.key}
            onClick={() => setDim(d.key)}
            label={d.label}
            count={d.count}
          />
        ))}
        <button
          className="ml-auto rounded-el border border-gray-300 px-3.5 py-1.5 text-[0.82rem] font-medium text-gray-700 hover:border-ink hover:text-ink disabled:opacity-50"
          onClick={triggerPipeline}
          disabled={pipelineRunning}
          title="Aktive Quellen abrufen, deduplizieren und mit Claude bewerten"
        >
          {pipelineRunning ? "Quellen werden abgerufen …" : "↻ Quellen abrufen"}
        </button>
      </div>
      {pipelineMsg && (
        <p className="-mt-4 mb-5 text-[0.82rem] text-gray-500">{pipelineMsg}</p>
      )}

      <div className="grid items-start gap-9 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3.5">
          {visible.map((s) => (
            <div
              key={s.id}
              className="rounded-card border border-gray-150 p-[18px] px-5 transition-colors hover:border-ink"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2.5">
                {isNew(s) && <Tag tone="new">Neu</Tag>}
                {s.relevance >= 80 && <Tag tone="hot">Hohe Relevanz</Tag>}
                {s.isKpiSignal && <Tag tone="kpi">KPI-Signal</Tag>}
                <Tag>{dimensionLabel(s.dimension)}</Tag>
                <span className="ml-auto text-[0.78rem] text-gray-500">
                  {fmtRelativeDay(new Date(s.occurredAt), now)}
                </span>
              </div>
              <h4 className="mb-1.5 text-[1.02rem] font-medium">{s.title}</h4>
              <p className="text-[0.9rem] leading-normal text-gray-700">{s.summary}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-3.5 text-[0.78rem] text-gray-500">
                <span>
                  Quelle:{" "}
                  {s.sourceUrl ? (
                    <a href={s.sourceUrl} className="underline hover:text-ink" target="_blank">
                      {s.sourceLabel ?? s.sourceUrl}
                    </a>
                  ) : (
                    (s.sourceLabel ?? "–")
                  )}
                </span>
                {reviewed[s.id] === "relevant" && (
                  <span className="font-medium text-pos">Als relevant markiert</span>
                )}
                <div className="ml-auto flex gap-1.5">
                  {s.isKpiSignal ? (
                    <>
                      <Act onClick={() => toTask(s.id)}>→ Aufgabe</Act>
                      <Act onClick={() => onShowTab("projekte")}>Details</Act>
                    </>
                  ) : (
                    <>
                      {s.review === "open" && !reviewed[s.id] && (
                        <>
                          <Act onClick={() => review(s.id, "relevant")}>Relevant</Act>
                          <Act onClick={() => review(s.id, "irrelevant")}>Irrelevant</Act>
                        </>
                      )}
                      <Act onClick={() => toOpportunity(s.id)}>→ Opportunity</Act>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <p className="py-8 text-center text-[0.9rem] text-gray-500">
              Keine Signale in dieser Dimension.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Signalvolumen, 6 Monate">
            <div className="h-[150px]">
              <ChartCanvas
                config={{
                  type: "bar",
                  data: {
                    labels: customer.monthly.map((m) => m.label),
                    datasets: [
                      {
                        label: "Signale",
                        data: customer.monthly.map((m) => m.total),
                        backgroundColor: "#0A0A0A",
                        borderRadius: 4,
                        barPercentage: 0.55,
                      },
                      {
                        label: "davon hohe Relevanz",
                        data: customer.monthly.map((m) => m.hot),
                        backgroundColor: "#F1BB1E",
                        borderRadius: 4,
                        barPercentage: 0.55,
                      },
                    ],
                  },
                  options: {
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { display: false } },
                      y: { grid: { color: "#F4F4F1" }, ticks: { stepSize: 2 } },
                    },
                  },
                }}
              />
            </div>
          </Panel>

          <Panel title="Radar-Lage">
            <Row label="Neue Signale (7 Tage)" value={String(signals.filter((s) => isNew(s) && new Date(s.occurredAt) >= weekAgo).length)} />
            <Row label="Hohe Relevanz" value={String(signals.filter((s) => s.relevance >= 80).length)} />
            <Row label="Offene Opportunities" value={String(openOpps)} />
            <Row label="Review-Queue" value={String(reviewQueue)} />
            <Row label="Nächster Bericht" value={fmtDay(nextReport)} />
          </Panel>

          {customer.competitors.length > 0 && (
            <Panel title="Mitbewerber im Blick">
              {customer.competitors.map((name) => {
                const n = signals.filter((s) =>
                  `${s.title} ${s.summary}`.toLowerCase().includes(name.toLowerCase())
                ).length;
                return (
                  <Row key={name} label={name} value={n > 0 ? `${n} Signal${n === 1 ? "" : "e"}` : "–"} />
                );
              })}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-[15px] py-1.5 text-[0.85rem] ${
        active
          ? "border-ink bg-ink font-medium text-paper"
          : "border-gray-300 bg-paper text-gray-700 hover:border-ink hover:text-ink"
      }`}
    >
      {label} <span className="text-[0.75rem] opacity-60">{count}</span>
    </button>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "new" | "hot" | "kpi" }) {
  const cls =
    tone === "new"
      ? "bg-accent text-ink"
      : tone === "hot"
        ? "bg-ink text-paper"
        : tone === "kpi"
          ? "bg-accent-soft text-gray-900"
          : "bg-gray-75 text-gray-700";
  return (
    <span className={`rounded px-[9px] py-[3px] text-[0.72rem] font-medium uppercase tracking-[0.04em] ${cls}`}>
      {children}
    </span>
  );
}

function Act({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-gray-150 px-2.5 py-1 text-[0.78rem] text-gray-700 hover:border-ink hover:text-ink"
    >
      {children}
    </button>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-gray-150 p-5">
      <h4 className="mb-3.5 text-[0.95rem]">{title}</h4>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-75 py-[7px] text-[0.88rem] text-gray-700 last:border-none">
      <span>{label}</span>
      <b className="font-medium text-ink">{value}</b>
    </div>
  );
}
