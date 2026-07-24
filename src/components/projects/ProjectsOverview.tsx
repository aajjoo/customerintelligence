"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import ChartCanvas from "@/components/ChartCanvas";
import { createProject, deleteProject, importJiraProjects, updateProjectEconomics } from "@/app/actions";

// Projekte (Client, Konzept 5): Karten je Projekt mit Ticket-Entwicklung,
// Stunden vs. Budget, KI-Einschätzung (Probleme + DB-Ziel mit Quellen).
// Anlage manuell (mit Ziel-URLs) oder per Jira-Import (führendes System).

type KpiDTO = { label: string; unit: string | null; latest: number | null; target: number | null };

type ProjectDTO = {
  id: string;
  name: string;
  phase: string | null;
  status: string;
  externalRef: string | null;
  jiraUrl: string | null;
  confluenceUrl: string | null;
  budgetHours: number | null;
  spentHours: number | null;
  dbTargetPct: number | null;
  ticketStatsJson: string | null;
  healthJson: string | null;
  syncedAt: string | null;
  customerName: string;
  customerSlug: string;
  kpis: KpiDTO[];
};

type CustomerOption = { id: string; name: string; slug: string };

type JiraRow = { key: string; name: string; url: string; imported: boolean; customerId: string; selected: boolean };

const STATUS = {
  ok: { label: "Im Plan", cls: "bg-pos" },
  watch: { label: "Beobachten", cls: "bg-accent" },
  critical: { label: "Kritisch", cls: "bg-neg" },
} as Record<string, { label: string; cls: string }>;

const DB_LABELS: Record<string, { label: string; cls: string }> = {
  on_track: { label: "im DB-Ziel", cls: "text-pos" },
  at_risk: { label: "DB-Ziel gefährdet", cls: "text-accent-strong" },
  off_track: { label: "DB-Ziel verfehlt", cls: "text-neg" },
  unknown: { label: "DB: keine Datenbasis", cls: "text-gray-500" },
};

const EMPTY_FORM = {
  customerId: "",
  name: "",
  phase: "",
  externalRef: "",
  jiraUrl: "",
  confluenceUrl: "",
  budgetHours: "",
  spentHours: "",
  dbTargetPct: "",
};

export default function ProjectsOverview({
  projects,
  customers,
  jiraConfigured,
}: {
  projects: ProjectDTO[];
  customers: CustomerOption[];
  jiraConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM });
  const [syncing, setSyncing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [jiraRows, setJiraRows] = useState<JiraRow[] | null>(null);
  const [jiraLoading, setJiraLoading] = useState(false);

  const act = (fn: () => Promise<unknown>, success?: string) => {
    setMsg(null);
    startTransition(async () => {
      try {
        await fn();
        if (success) setMsg(success);
        setCreating(false);
        setEditing(null);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
      }
    });
  };

  async function sync(p: ProjectDTO) {
    setMsg(
      `${p.name}: Jira/Confluence werden gelesen und mit Claude bewertet – kann eine Minute dauern …`
    );
    setSyncing(p.id);
    try {
      const res = await fetch("/api/projekte/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aktualisierung fehlgeschlagen");
      setMsg(
        `${p.name}: Einschätzung aktualisiert${data.notes?.length ? ` (${data.notes.join(" · ")})` : ""}`
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Aktualisierung fehlgeschlagen");
    } finally {
      setSyncing(null);
    }
  }

  async function loadJira() {
    setJiraLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/projekte/jira");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Jira-Abruf fehlgeschlagen");
      setJiraRows(
        (data.projects as Omit<JiraRow, "customerId" | "selected">[]).map((p) => ({
          ...p,
          customerId: customers[0]?.id ?? "",
          selected: false,
        }))
      );
      if ((data.projects ?? []).length === 0) setMsg("Keine Jira-Projekte gefunden.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Jira-Abruf fehlgeschlagen");
    } finally {
      setJiraLoading(false);
    }
  }

  const numField = (
    label: string,
    key: keyof typeof EMPTY_FORM,
    state: typeof EMPTY_FORM,
    setState: (v: typeof EMPTY_FORM) => void
  ) => (
    <label className="flex flex-col gap-1 text-[0.78rem] text-gray-500">
      {label}
      <input
        className="w-[110px] rounded-el border border-gray-300 px-2 py-1.5 text-[0.85rem] text-ink outline-none focus:border-ink"
        value={state[key]}
        onChange={(e) => setState({ ...state, [key]: e.target.value })}
        placeholder="–"
      />
    </label>
  );

  const urlFields = (state: typeof EMPTY_FORM, setState: (v: typeof EMPTY_FORM) => void) => (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-[0.78rem] text-gray-500">
          Jira-Projekt-Key (für Sync)
          <input
            className="rounded-el border border-gray-300 px-2 py-1.5 text-[0.85rem] text-ink outline-none focus:border-ink"
            value={state.externalRef}
            onChange={(e) => setState({ ...state, externalRef: e.target.value })}
            placeholder="z. B. NET"
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.78rem] text-gray-500">
          Jira-URL
          <input
            className="rounded-el border border-gray-300 px-2 py-1.5 text-[0.85rem] text-ink outline-none focus:border-ink"
            value={state.jiraUrl}
            onChange={(e) => setState({ ...state, jiraUrl: e.target.value })}
            placeholder="https://….atlassian.net/browse/NET"
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.78rem] text-gray-500">
          Confluence-URL
          <input
            className="rounded-el border border-gray-300 px-2 py-1.5 text-[0.85rem] text-ink outline-none focus:border-ink"
            value={state.confluenceUrl}
            onChange={(e) => setState({ ...state, confluenceUrl: e.target.value })}
            placeholder="https://….atlassian.net/wiki/…"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {numField("Budget (h)", "budgetHours", state, setState)}
        {numField("Verbraucht (h)", "spentHours", state, setState)}
        {numField("DB-Ziel (%)", "dbTargetPct", state, setState)}
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[0.78rem] text-gray-500">
          Phase
          <input
            className="rounded-el border border-gray-300 px-2 py-1.5 text-[0.85rem] text-ink outline-none focus:border-ink"
            value={state.phase}
            onChange={(e) => setState({ ...state, phase: e.target.value })}
            placeholder="z. B. Umsetzung · Sprint 12"
          />
        </label>
      </div>
    </>
  );

  return (
    <div className="mt-8 flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          className="rounded-el bg-ink px-4 py-2 text-[0.85rem] font-medium text-paper hover:bg-gray-900"
          onClick={() => {
            setCreating(!creating);
            setForm({ ...EMPTY_FORM, customerId: customers[0]?.id ?? "" });
          }}
        >
          + Projekt anlegen
        </button>
        {jiraConfigured ? (
          <button
            className="rounded-el border border-gray-300 px-4 py-2 text-[0.85rem] font-medium hover:border-ink disabled:opacity-50"
            onClick={loadJira}
            disabled={jiraLoading}
          >
            {jiraLoading ? "Lade Jira-Projekte …" : "⇅ Aus Jira importieren"}
          </button>
        ) : (
          <span className="text-[0.8rem] text-gray-500">
            Jira-Import inaktiv – JIRA_BASE_URL, JIRA_EMAIL und JIRA_API_TOKEN setzen.
          </span>
        )}
        {msg && <span className="w-full text-[0.85rem] text-gray-700">{msg}</span>}
      </div>

      {/* ---- Jira-Import: laufende Projekte übernehmen ---- */}
      {jiraRows && (
        <div className="rounded-card border border-gray-150 border-l-[3px] border-l-accent p-6">
          <h3 className="mb-1 text-[1.05rem]">Jira-Projekte übernehmen</h3>
          <p className="mb-4 text-[0.82rem] text-gray-500">
            Auswählen, welchem Kunden das Projekt gehört – bereits übernommene sind markiert.
          </p>
          {jiraRows.map((row, idx) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center gap-3 border-b border-gray-75 py-2 text-[0.88rem]"
            >
              <input
                type="checkbox"
                className="accent-ink"
                checked={row.selected}
                disabled={row.imported}
                onChange={(e) =>
                  setJiraRows(jiraRows.map((r, i) => (i === idx ? { ...r, selected: e.target.checked } : r)))
                }
              />
              <span className={row.imported ? "text-gray-500" : "font-medium"}>
                {row.name} <span className="text-gray-500">({row.key})</span>
              </span>
              {row.imported ? (
                <span className="text-[0.75rem] text-pos">✓ bereits übernommen</span>
              ) : (
                <select
                  className="rounded-el border border-gray-300 bg-paper px-2 py-1 text-[0.8rem]"
                  value={row.customerId}
                  onChange={(e) =>
                    setJiraRows(jiraRows.map((r, i) => (i === idx ? { ...r, customerId: e.target.value } : r)))
                  }
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-el bg-ink px-4 py-2 text-[0.85rem] font-medium text-paper disabled:opacity-50"
              disabled={pending || !jiraRows.some((r) => r.selected)}
              onClick={() =>
                act(async () => {
                  const items = jiraRows
                    .filter((r) => r.selected && !r.imported)
                    .map((r) => ({ key: r.key, name: r.name, url: r.url, customerId: r.customerId }));
                  const { created } = await importJiraProjects(items);
                  setJiraRows(null);
                  setMsg(`${created} Projekt(e) übernommen – „Aktualisieren“ lädt Tickets und Einschätzung.`);
                })
              }
            >
              Übernehmen
            </button>
            <button
              className="rounded-el border border-gray-300 px-4 py-2 text-[0.85rem] font-medium"
              onClick={() => setJiraRows(null)}
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* ---- Manuelle Anlage mit Ziel-URLs ---- */}
      {creating && (
        <div className="rounded-card border border-gray-150 border-l-[3px] border-l-accent p-6">
          <h3 className="mb-4 text-[1.05rem]">Neues Projekt</h3>
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-[0.78rem] text-gray-500">
                Kunde
                <select
                  className="rounded-el border border-gray-300 bg-paper px-2 py-1.5 text-[0.85rem] text-ink"
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[0.78rem] text-gray-500">
                Projektname
                <input
                  className="rounded-el border border-gray-300 px-2 py-1.5 text-[0.85rem] text-ink outline-none focus:border-ink"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="z. B. Kundenportal Relaunch"
                />
              </label>
            </div>
            {urlFields(form, setForm)}
            <div className="flex gap-2">
              <button
                className="rounded-el bg-ink px-4 py-2 text-[0.85rem] font-medium text-paper disabled:opacity-50"
                disabled={pending || !form.name.trim() || !form.customerId}
                onClick={() =>
                  act(
                    () =>
                      createProject(form.customerId, {
                        name: form.name,
                        description: "",
                        phase: form.phase,
                        status: "ok",
                        externalRef: form.externalRef,
                        jiraUrl: form.jiraUrl,
                        confluenceUrl: form.confluenceUrl,
                        budgetHours: form.budgetHours,
                        spentHours: form.spentHours,
                        dbTargetPct: form.dbTargetPct,
                        kpis: [],
                      }),
                    "Projekt angelegt – „Aktualisieren“ lädt Tickets und Einschätzung."
                  )
                }
              >
                Anlegen
              </button>
              <button
                className="rounded-el border border-gray-300 px-4 py-2 text-[0.85rem] font-medium"
                onClick={() => setCreating(false)}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Projektkarten ---- */}
      {projects.map((p) => {
        const status = STATUS[p.status] ?? STATUS.ok;
        const stats = p.ticketStatsJson ? JSON.parse(p.ticketStatsJson) : null;
        const health = p.healthJson ? JSON.parse(p.healthJson) : null;
        const db = health ? (DB_LABELS[health.dbAssessment] ?? DB_LABELS.unknown) : null;
        const pct =
          p.budgetHours && p.spentHours != null
            ? Math.round((p.spentHours / p.budgetHours) * 100)
            : null;
        return (
          <div key={p.id} className="rounded-card border border-gray-150 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[240px]">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${status.cls}`} aria-hidden />
                  <h3 className="text-[1.1rem]">{p.name}</h3>
                  <span className="text-[0.75rem] font-medium uppercase tracking-wide text-gray-500">
                    {status.label}
                  </span>
                </div>
                <div className="mt-0.5 text-[0.82rem] text-gray-500">
                  <Link href={`/kunden/${p.customerSlug}?tab=projekte`} className="font-medium text-gray-700 hover:text-ink">
                    {p.customerName}
                  </Link>
                  {p.phase ? ` · ${p.phase}` : ""}
                  {p.externalRef ? ` · ${p.externalRef}` : ""}
                </div>
              </div>
              <span className="ml-auto flex flex-wrap items-center gap-2 text-[0.8rem]">
                {p.jiraUrl && (
                  <a href={p.jiraUrl} target="_blank" rel="noreferrer" className="rounded border border-gray-150 px-2 py-1 hover:border-ink">
                    Jira ↗
                  </a>
                )}
                {p.confluenceUrl && (
                  <a href={p.confluenceUrl} target="_blank" rel="noreferrer" className="rounded border border-gray-150 px-2 py-1 hover:border-ink">
                    Confluence ↗
                  </a>
                )}
                <button
                  className="rounded-el border border-gray-300 px-3 py-1.5 font-medium hover:border-ink disabled:opacity-50"
                  onClick={() => sync(p)}
                  disabled={syncing !== null}
                >
                  {syncing === p.id ? "Aktualisiere …" : "↻ Aktualisieren"}
                </button>
                <button
                  className="rounded-el border border-gray-300 px-3 py-1.5 font-medium hover:border-ink"
                  onClick={() => {
                    setEditing(editing === p.id ? null : p.id);
                    setEditForm({
                      customerId: "",
                      name: p.name,
                      phase: p.phase ?? "",
                      externalRef: p.externalRef ?? "",
                      jiraUrl: p.jiraUrl ?? "",
                      confluenceUrl: p.confluenceUrl ?? "",
                      budgetHours: p.budgetHours?.toString() ?? "",
                      spentHours: p.spentHours?.toString() ?? "",
                      dbTargetPct: p.dbTargetPct?.toString() ?? "",
                    });
                  }}
                >
                  Bearbeiten
                </button>
                {confirmDelete === p.id ? (
                  <>
                    <button
                      className="rounded-el bg-neg px-3 py-1.5 font-medium text-paper"
                      onClick={() => act(() => deleteProject(p.id), `${p.name} gelöscht`)}
                    >
                      Endgültig löschen
                    </button>
                    <button
                      className="rounded-el border border-gray-300 px-3 py-1.5 font-medium"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <button
                    className="rounded-el border border-gray-300 px-3 py-1.5 font-medium text-neg hover:border-neg"
                    onClick={() => setConfirmDelete(p.id)}
                  >
                    Löschen
                  </button>
                )}
              </span>
            </div>

            {editing === p.id && (
              <div className="mt-4 grid gap-3 border-t border-gray-75 pt-4">
                {urlFields(editForm, setEditForm)}
                <div className="flex gap-2">
                  <button
                    className="rounded-el bg-ink px-4 py-2 text-[0.85rem] font-medium text-paper disabled:opacity-50"
                    disabled={pending}
                    onClick={() =>
                      act(
                        () =>
                          updateProjectEconomics(p.id, {
                            externalRef: editForm.externalRef,
                            jiraUrl: editForm.jiraUrl,
                            confluenceUrl: editForm.confluenceUrl,
                            budgetHours: editForm.budgetHours,
                            spentHours: editForm.spentHours,
                            dbTargetPct: editForm.dbTargetPct,
                            phase: editForm.phase,
                          }),
                        "Gespeichert"
                      )
                    }
                  >
                    Speichern
                  </button>
                  <button
                    className="rounded-el border border-gray-300 px-4 py-2 text-[0.85rem] font-medium"
                    onClick={() => setEditing(null)}
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-6 lg:grid-cols-3">
              {/* Tickets */}
              <div>
                <div className="mb-2 text-[0.75rem] font-medium uppercase tracking-[0.07em] text-gray-500">
                  Ticket-Entwicklung
                </div>
                {stats ? (
                  <>
                    <div className="mb-2 text-[0.85rem] text-gray-700">
                      {stats.open} offen · {stats.inProgress} in Arbeit · {stats.done} erledigt
                    </div>
                    <div className="h-[120px]">
                      <ChartCanvas
                        config={{
                          type: "bar",
                          data: {
                            labels: stats.weeks.map((w: { week: string }) => w.week),
                            datasets: [
                              {
                                label: "Angelegt",
                                data: stats.weeks.map((w: { created: number }) => w.created),
                                backgroundColor: "#0A0A0A",
                              },
                              {
                                label: "Gelöst",
                                data: stats.weeks.map((w: { resolved: number }) => w.resolved),
                                backgroundColor: "#F1BB1E",
                              },
                            ],
                          },
                          options: {
                            plugins: { legend: { position: "bottom" } },
                            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                          },
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-[0.82rem] text-gray-500">
                    Noch keine Jira-Daten – Projekt-Key hinterlegen und „Aktualisieren“.
                  </p>
                )}
              </div>

              {/* Stunden & DB */}
              <div>
                <div className="mb-2 text-[0.75rem] font-medium uppercase tracking-[0.07em] text-gray-500">
                  Stunden & Deckungsbeitrag
                </div>
                {p.budgetHours ? (
                  <>
                    <div className="mb-1.5 text-[0.85rem] text-gray-700">
                      {p.spentHours ?? 0} h von {p.budgetHours} h verbraucht
                      {pct != null ? ` (${pct} %)` : ""}
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-75">
                      <div
                        className={`h-full ${pct != null && pct > 100 ? "bg-neg" : pct != null && pct > 85 ? "bg-accent" : "bg-ink"}`}
                        style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-[0.82rem] text-gray-500">
                    Kein Stundenbudget hinterlegt – über „Bearbeiten“ ergänzen.
                  </p>
                )}
                {p.dbTargetPct != null && (
                  <div className="mt-2 text-[0.82rem] text-gray-700">DB-Ziel: {p.dbTargetPct} %</div>
                )}
                {db && (
                  <div className={`mt-2 text-[0.88rem] font-medium ${db.cls}`}>{db.label}</div>
                )}
                {health?.dbRationaleDe && (
                  <p className="mt-1 text-[0.82rem] leading-relaxed text-gray-700">
                    {health.dbRationaleDe}
                  </p>
                )}
                {p.kpis.length > 0 && (
                  <div className="mt-3 text-[0.82rem] text-gray-700">
                    {p.kpis.map((k) => (
                      <div key={k.label}>
                        {k.label}: {k.latest ?? "–"}
                        {k.unit === "%" ? " %" : ""}
                        {k.target != null ? ` (Ziel ${k.target}${k.unit === "%" ? " %" : ""})` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* KI-Einschätzung */}
              <div>
                <div className="mb-2 text-[0.75rem] font-medium uppercase tracking-[0.07em] text-gray-500">
                  Einschätzung
                  {p.syncedAt ? (
                    <span className="ml-1.5 normal-case tracking-normal text-gray-500">
                      · Stand {p.syncedAt.slice(0, 10)}
                    </span>
                  ) : null}
                </div>
                {health ? (
                  <>
                    <p className="text-[0.85rem] leading-relaxed text-gray-900">{health.summaryDe}</p>
                    {health.problems?.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {health.problems.map(
                          (pr: { titleDe: string; evidenceDe: string; source: string }, i: number) => (
                            <li key={i} className="text-[0.82rem] leading-snug text-gray-700">
                              <span className="font-medium text-ink">{pr.titleDe}</span> – {pr.evidenceDe}{" "}
                              <span className="rounded bg-gray-75 px-1.5 py-px text-[0.72rem]">{pr.source}</span>
                            </li>
                          )
                        )}
                      </ul>
                    )}
                    {health.problems?.length === 0 && (
                      <p className="mt-1 text-[0.82rem] text-gray-500">Keine Auffälligkeiten erkannt.</p>
                    )}
                  </>
                ) : (
                  <p className="text-[0.82rem] text-gray-500">
                    Noch keine Einschätzung – „Aktualisieren“ bewertet Tickets, Confluence und Stundenstand.
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {projects.length === 0 && (
        <p className="py-10 text-center text-[0.9rem] text-gray-500">
          Noch keine Projekte – manuell anlegen oder aus Jira importieren.
        </p>
      )}
    </div>
  );
}
