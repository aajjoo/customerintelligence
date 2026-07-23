"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addSource,
  deleteCustomer,
  deleteSource,
  runPipelineForCustomer,
  saveAreaSkill,
  setResearchFrequency,
  setUserRole,
  toggleSource,
} from "@/app/actions";

// Verwaltung (Client): Kundenliste mit Frequenz/Recherche/Löschen, Quellen je Kunde,
// Benutzerrollen (Admin), Leistungsportfolio-Editor (wirkt auf die AI-Analyse).

type SourceRow = {
  id: string;
  kind: string;
  label: string;
  url: string | null;
  active: boolean;
  lastFetchedAt: string | null;
};

type CustomerRow = {
  id: string;
  name: string;
  slug: string;
  industry: string;
  researchFrequency: string;
  leadName: string | null;
  signalCount: number;
  sources: SourceRow[];
};

type UserRow = { id: string; name: string; email: string; role: string; isSelf: boolean };

const FREQUENCIES = [
  { key: "daily", label: "täglich" },
  { key: "weekly", label: "wöchentlich (Mo)" },
  { key: "off", label: "aus" },
];

export default function AdminPanel({
  customers,
  users,
  isAdmin,
  portfolio,
}: {
  customers: CustomerRow[];
  users: UserRow[];
  isAdmin: boolean;
  portfolio: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [portfolioText, setPortfolioText] = useState(portfolio);
  const [newSource, setNewSource] = useState({ kind: "news", label: "", url: "" });

  const act = (fn: () => Promise<unknown>, success?: string) => {
    setMsg(null);
    startTransition(async () => {
      try {
        await fn();
        if (success) setMsg(success);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
      }
    });
  };

  async function research(customerId: string, name: string) {
    setMsg(null);
    setRunning(customerId);
    try {
      const result = await runPipelineForCustomer(customerId);
      setMsg(
        `${name}: ${result.fetched} Items geholt, ${result.created + result.kpiSignals} neue Signale` +
          (result.errors.length > 0 ? ` · ${result.errors[0]}` : "")
      );
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Recherche fehlgeschlagen");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-10">
      {msg && <p className="text-[0.85rem] text-gray-700">{msg}</p>}

      {/* ---- Kunden ---- */}
      <section>
        <h2 className="mb-4 text-[1.2rem]">Kunden</h2>
        <div className="flex flex-col gap-3">
          {customers.map((c) => (
            <div key={c.id} className="rounded-card border border-gray-150 p-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-[200px]">
                  <a href={`/kunden/${c.slug}`} className="font-medium hover:underline">
                    {c.name}
                  </a>
                  <div className="text-[0.8rem] text-gray-500">
                    {c.industry} · {c.signalCount} Signale
                    {c.leadName ? ` · Lead: ${c.leadName}` : ""}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[0.82rem] text-gray-700">
                  Recherche:
                  <select
                    className="rounded-el border border-gray-300 bg-paper px-2 py-1 text-[0.82rem]"
                    value={c.researchFrequency}
                    onChange={(e) => act(() => setResearchFrequency(c.id, e.target.value))}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="rounded-el border border-gray-300 px-3 py-1.5 text-[0.82rem] font-medium hover:border-ink disabled:opacity-50"
                  onClick={() => research(c.id, c.name)}
                  disabled={running !== null}
                >
                  {running === c.id ? "Recherchiere …" : "↻ Jetzt recherchieren"}
                </button>
                <button
                  className="rounded-el border border-gray-300 px-3 py-1.5 text-[0.82rem] font-medium hover:border-ink"
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                >
                  Quellen ({c.sources.length})
                </button>
                <span className="ml-auto">
                  {confirmDelete === c.id ? (
                    <span className="flex items-center gap-2 text-[0.82rem]">
                      <span className="text-neg">Alle Daten des Kunden werden gelöscht.</span>
                      <button
                        className="rounded-el bg-neg px-3 py-1.5 font-medium text-paper disabled:opacity-50"
                        onClick={() => act(() => deleteCustomer(c.id), `${c.name} gelöscht`)}
                        disabled={pending}
                      >
                        Endgültig löschen
                      </button>
                      <button
                        className="rounded-el border border-gray-300 px-3 py-1.5 font-medium"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Abbrechen
                      </button>
                    </span>
                  ) : (
                    <button
                      className="rounded-el border border-gray-300 px-3 py-1.5 text-[0.82rem] font-medium text-neg hover:border-neg"
                      onClick={() => setConfirmDelete(c.id)}
                    >
                      Löschen
                    </button>
                  )}
                </span>
              </div>

              {expanded === c.id && (
                <div className="mt-4 border-t border-gray-75 pt-4">
                  {c.sources.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center gap-3 border-b border-gray-75 py-2 text-[0.85rem]"
                    >
                      <span className={s.active ? "" : "text-gray-500 line-through"}>
                        {s.label}
                      </span>
                      <span className="text-[0.74rem] text-gray-500">
                        {s.kind === "news" ? "RSS" : "Website"} · {s.url}
                        {s.lastFetchedAt
                          ? ` · zuletzt ${s.lastFetchedAt.slice(0, 10)}`
                          : " · noch nie abgerufen"}
                      </span>
                      <span className="ml-auto flex gap-2">
                        <button
                          className="rounded border border-gray-150 px-2 py-0.5 text-[0.74rem] hover:border-ink"
                          onClick={() => act(() => toggleSource(s.id))}
                        >
                          {s.active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button
                          className="rounded border border-gray-150 px-2 py-0.5 text-[0.74rem] text-neg hover:border-neg"
                          onClick={() => act(() => deleteSource(s.id))}
                        >
                          Löschen
                        </button>
                      </span>
                    </div>
                  ))}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-el border border-gray-300 bg-paper px-2 py-1.5 text-[0.82rem]"
                      value={newSource.kind}
                      onChange={(e) => setNewSource({ ...newSource, kind: e.target.value })}
                    >
                      <option value="news">RSS-Feed</option>
                      <option value="website">Website</option>
                    </select>
                    <input
                      className="rounded-el border border-gray-300 px-2 py-1.5 text-[0.82rem] outline-none focus:border-ink"
                      placeholder="Label"
                      value={newSource.label}
                      onChange={(e) => setNewSource({ ...newSource, label: e.target.value })}
                    />
                    <input
                      className="min-w-[220px] flex-1 rounded-el border border-gray-300 px-2 py-1.5 text-[0.82rem] outline-none focus:border-ink"
                      placeholder="https://…"
                      value={newSource.url}
                      onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                    />
                    <button
                      className="rounded-el bg-ink px-3 py-1.5 text-[0.82rem] font-medium text-paper disabled:opacity-50"
                      disabled={pending || !newSource.label.trim() || !newSource.url.trim()}
                      onClick={() =>
                        act(async () => {
                          await addSource(c.id, {
                            kind: newSource.kind as "news" | "website",
                            label: newSource.label,
                            url: newSource.url,
                          });
                          setNewSource({ kind: "news", label: "", url: "" });
                        }, "Quelle angelegt")
                      }
                    >
                      + Quelle
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---- Benutzer (nur Management/Admin) ---- */}
      {isAdmin && (
        <section>
          <h2 className="mb-4 text-[1.2rem]">Benutzer & Rollen</h2>
          <div className="rounded-card border border-gray-150">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-3 border-b border-gray-75 px-5 py-3 text-[0.9rem] last:border-none"
              >
                <span className="min-w-[160px] font-medium">{u.name}</span>
                <span className="text-[0.8rem] text-gray-500">{u.email}</span>
                <select
                  className="ml-auto rounded-el border border-gray-300 bg-paper px-2 py-1 text-[0.82rem] disabled:opacity-50"
                  value={u.role}
                  disabled={u.isSelf}
                  title={u.isSelf ? "Die eigene Rolle kann nicht geändert werden" : undefined}
                  onChange={(e) => act(() => setUserRole(u.id, e.target.value))}
                >
                  <option value="member">Teammitglied</option>
                  <option value="lead">Account Lead</option>
                  <option value="management">Management</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Leistungsportfolio ---- */}
      <section>
        <h2 className="mb-1 text-[1.2rem]">Netural-Leistungsportfolio</h2>
        <p className="mb-3 max-w-[640px] text-[0.85rem] text-gray-500">
          Referenz für die Relevanzbewertung der Pipeline und die Anknüpfungspunkte in Berichten
          und Workflows. Leer lassen für den eingebauten Standardtext.
        </p>
        <textarea
          className="h-40 w-full max-w-[760px] rounded-card border border-gray-150 p-4 text-[0.9rem] leading-relaxed outline-none focus:border-ink"
          value={portfolioText}
          onChange={(e) => setPortfolioText(e.target.value)}
          placeholder="Netural ist eine Digitalagentur mit diesen Leistungsfeldern: …"
        />
        <div className="mt-2">
          <button
            className="rounded-el bg-ink px-4 py-2 text-[0.85rem] font-medium text-paper disabled:opacity-50"
            disabled={pending}
            onClick={() =>
              act(() => saveAreaSkill("leistungsportfolio", portfolioText), "Leistungsportfolio gespeichert")
            }
          >
            Speichern
          </button>
        </div>
      </section>
    </div>
  );
}
