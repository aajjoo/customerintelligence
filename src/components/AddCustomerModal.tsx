"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCustomerFromProposal } from "@/app/actions";
import type { CustomerProposal } from "@/lib/onboarding/extract";

// Modal "Kunde hinzufügen" (Etappe 4): URL → Crawl + Claude-Profilvorschlag →
// prüfen/korrigieren → Kunde mit Quellen und Team-Zuordnung anlegen.
// Ablauf und Optik wie im Prototyp; alle Vorschlagsfelder sind editierbar.

type Phase = "input" | "extracting" | "review" | "creating";

export default function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CustomerProposal | null>(null);
  const [, startTransition] = useTransition();

  async function extract() {
    setError(null);
    setPhase("extracting");
    try {
      const res = await fetch("/api/onboarding/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraktion fehlgeschlagen");
      setProposal(data);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraktion fehlgeschlagen");
      setPhase("input");
    }
  }

  function create() {
    if (!proposal) return;
    setError(null);
    setPhase("creating");
    startTransition(async () => {
      try {
        const { slug } = await createCustomerFromProposal(proposal);
        onClose();
        router.push(`/kunden/${slug}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Anlegen fehlgeschlagen");
        setPhase("review");
      }
    });
  }

  const set = (patch: Partial<CustomerProposal>) =>
    setProposal((p) => (p ? { ...p, ...patch } : p));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-5"
      onClick={phase === "extracting" || phase === "creating" ? undefined : onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-paper p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1.5 text-[1.35rem]">Kunde hinzufügen</h3>
        <p className="mb-5 text-[0.9rem] text-gray-500">
          Webadresse eingeben – der Radar extrahiert daraus einen Profilvorschlag, den du prüfst
          und bestätigst.
        </p>

        <input
          className="w-full rounded-el border border-gray-300 px-4 py-3 font-sans text-base outline-none focus:border-ink disabled:bg-gray-75"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && phase === "input" && url.trim() && extract()}
          placeholder="https://www.kunde.com"
          disabled={phase !== "input"}
        />

        {error && <p className="mt-3 text-[0.85rem] text-neg">{error}</p>}

        {phase === "extracting" && (
          <p className="mt-4 text-[0.9rem] text-gray-500">
            Website wird gecrawlt und mit Claude analysiert – das dauert einen Moment …
          </p>
        )}

        {(phase === "review" || phase === "creating") && proposal && (
          <div className="mt-5">
            <Row label="Unternehmen">
              <input
                className="w-full border-b border-gray-150 bg-transparent pb-1 outline-none focus:border-ink"
                value={proposal.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Row>
            <Row label="Branche">
              <input
                className="w-full border-b border-gray-150 bg-transparent pb-1 outline-none focus:border-ink"
                value={proposal.industry}
                onChange={(e) => set({ industry: e.target.value })}
              />
            </Row>
            <Row label="Märkte">
              <input
                className="w-full border-b border-gray-150 bg-transparent pb-1 outline-none focus:border-ink"
                value={proposal.markets ?? ""}
                placeholder="z. B. Österreich, Deutschland"
                onChange={(e) => set({ markets: e.target.value || null })}
              />
            </Row>
            <Row label="Mitbewerber-Kandidaten" hint="bitte prüfen">
              <input
                className="w-full border-b border-gray-150 bg-transparent pb-1 outline-none focus:border-ink"
                value={proposal.competitors.join(", ")}
                placeholder="kommagetrennt"
                onChange={(e) =>
                  set({
                    competitors: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </Row>
            <Row label="Strategische Themen">
              <input
                className="w-full border-b border-gray-150 bg-transparent pb-1 outline-none focus:border-ink"
                value={proposal.themes.join(", ")}
                onChange={(e) =>
                  set({ themes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                }
              />
            </Row>
            <Row label="Quellen erkannt">
              <div className="flex flex-col gap-1.5">
                {proposal.sources.map((s, i) => (
                  <label key={s.url} className="flex items-start gap-2 text-[0.88rem]">
                    <input
                      type="checkbox"
                      className="mt-1 accent-ink"
                      checked
                      onChange={() =>
                        set({ sources: proposal.sources.filter((_, j) => j !== i) })
                      }
                    />
                    <span>
                      {s.label}{" "}
                      <span className="text-[0.76rem] text-gray-500">
                        ({s.kind === "news" ? "RSS" : "Website"} · {s.url})
                      </span>
                    </span>
                  </label>
                ))}
                {proposal.sources.length === 0 && (
                  <span className="text-[0.85rem] text-gray-500">
                    Keine Quellen ausgewählt – der Radar bleibt leer, bis Quellen ergänzt werden.
                  </span>
                )}
              </div>
            </Row>
            <p className="mt-3 text-[0.78rem] text-gray-500">
              Nach dem Anlegen holt „Quellen abrufen“ im Radar-Tab (oder der tägliche Lauf) die
              ersten Signale.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            className="rounded-el border border-gray-300 px-5 py-2.5 text-[0.9rem] font-medium hover:bg-gray-75 disabled:opacity-50"
            onClick={onClose}
            disabled={phase === "extracting" || phase === "creating"}
          >
            Abbrechen
          </button>
          {(phase === "input" || phase === "extracting") && (
            <button
              className="rounded-el bg-ink px-5 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-gray-900 disabled:opacity-50"
              onClick={extract}
              disabled={phase === "extracting" || !url.trim()}
            >
              {phase === "extracting" ? "Analysiere Website …" : "Profil extrahieren"}
            </button>
          )}
          {(phase === "review" || phase === "creating") && (
            <button
              className="rounded-el bg-ink px-5 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-gray-900 disabled:opacity-50"
              onClick={create}
              disabled={phase === "creating"}
            >
              {phase === "creating" ? "Wird angelegt …" : "Kunde anlegen & Radar starten"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 border-b border-gray-75 py-2.5 text-[0.9rem]">
      <div className="w-[150px] flex-shrink-0 pt-0.5 text-gray-500">
        {label}
        {hint && <span className="block text-[0.72rem]">({hint})</span>}
      </div>
      <div className="min-w-0 flex-1 font-normal">{children}</div>
    </div>
  );
}
