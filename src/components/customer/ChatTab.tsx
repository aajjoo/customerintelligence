"use client";

import { useEffect, useRef, useState } from "react";
import type { CustomerDTO } from "@/components/customer/types";

// Tab Chat: Verlauf mit Quellen-Chips, Fragevorschläge mit Rollen-Umschalter.
// Die Antworten werden in Etappe 2 deterministisch aus den Seed-Daten gebaut
// (jede Aussage mit Quelle, Kernregel 1); RAG über pgvector folgt in Etappe 6.

type Msg = { who: "user" | "ai"; text: React.ReactNode; sources?: string[] };

const SUGGESTIONS: Record<string, string[]> = {
  lead: [
    "Welche Opportunities stehen seit über 30 Tagen ohne nächsten Schritt?",
    "Wie haben sich die KPIs seit dem letzten Bericht entwickelt?",
    "Was haben die Mitbewerber in den letzten 90 Tagen kommuniziert?",
    "Welche Themen sollte ich im nächsten Jahresgespräch setzen?",
  ],
  member: [
    "Was ist diese Woche passiert, das unsere Projekte betrifft?",
    "Welche neuen Signale sollte ich vor dem nächsten Sprint kennen?",
    "Gibt es offene Aufgaben, die mir zugewiesen sind?",
    "Was sagt der Kunde öffentlich zum Thema Nachhaltigkeit?",
  ],
  mgmt: [
    "Gab es diesen Monat kritische Signale?",
    "Wo liegen die größten unbearbeiteten Opportunities?",
    "Welche Projekte sind nicht auf Kurs und warum?",
    "Wie entwickelt sich das Digitalbudget dieses Kunden?",
  ],
};

const ROLES = [
  { key: "lead", label: "Account Lead" },
  { key: "member", label: "Teammitglied" },
  { key: "mgmt", label: "Management" },
];

export default function ChatTab({ customer }: { customer: CustomerDTO }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [role, setRole] = useState("lead");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [msgs]);

  function buildAnswer(): Msg {
    // Kompakte Lage aus den relevantesten Signalen; Quellen-Chips aus deren Quellenangaben.
    const top = customer.signals
      .filter((s) => s.review !== "irrelevant")
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3);
    if (top.length === 0) {
      return {
        who: "ai",
        text: "Für diesen Kunden liegen noch keine Signale vor. Sobald der Radar Quellen auswertet, beantworte ich Fragen zur Lage – jede Aussage mit Quellenangabe.",
      };
    }
    return {
      who: "ai",
      text: (
        <>
          Das sind die aktuell relevantesten Punkte bei {customer.name}:
          {top.map((s, i) => (
            <p key={s.id} className="mt-2.5">
              <b className="font-medium">
                {i + 1}. {s.title}:
              </b>{" "}
              {s.summary}
            </p>
          ))}
          <p className="mt-2.5 text-gray-500">
            Vollständige Antworten aus allen Signalen, Berichten, Projekt- und KPI-Daten (RAG)
            folgen in Etappe 6.
          </p>
        </>
      ),
      sources: Array.from(new Set(top.map((s) => s.sourceLabel).filter(Boolean))) as string[],
    };
  }

  function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput("");
    setMsgs((m) => [...m, { who: "user", text: q }]);
    setTimeout(() => setMsgs((m) => [...m, buildAnswer()]), 400);
  }

  return (
    <div className="grid items-start gap-9 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-[540px] flex-col rounded-card border border-gray-150">
        <div ref={logRef} className="flex flex-1 flex-col gap-[18px] overflow-y-auto p-[26px]">
          {msgs.length === 0 && (
            <div className="max-w-[78%] self-start rounded-[14px] rounded-bl-[4px] bg-gray-75 px-[17px] py-[13px] text-[0.92rem] leading-relaxed">
              Frag den Radar zur Lage bei {customer.name} – zu Signalen, Projekten, KPIs oder
              Aufgaben. Jede Antwort trägt Quellenangaben.
            </div>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`max-w-[78%] rounded-[14px] px-[17px] py-[13px] text-[0.92rem] leading-relaxed ${
                m.who === "user"
                  ? "self-end rounded-br-[4px] bg-ink text-paper"
                  : "self-start rounded-bl-[4px] bg-gray-75"
              }`}
            >
              {m.text}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2.5 text-[0.76rem] text-gray-500">
                  {m.sources.map((s) => (
                    <span key={s} className="rounded-[5px] border border-gray-150 bg-paper px-2 py-0.5">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2.5 border-t border-gray-150 p-4">
          <input
            className="flex-1 rounded-el border border-gray-150 px-[15px] py-[11px] font-sans text-[0.92rem] outline-none focus:border-ink"
            placeholder={`Frage zu ${customer.name} stellen …`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            className="rounded-el bg-ink px-5 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-gray-900"
            onClick={() => send()}
          >
            Senden
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <h4 className="text-[0.95rem]">Vorgeschlagene Fragen</h4>
        <div className="text-[0.78rem] text-gray-500">
          Basierend auf deiner Rolle und der aktuellen Lage
        </div>
        <div className="mb-1 flex gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRole(r.key)}
              className={`rounded-full border px-3 py-[5px] text-[0.78rem] ${
                role === r.key
                  ? "border-ink bg-ink text-paper"
                  : "border-gray-300 text-gray-700 hover:border-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {SUGGESTIONS[role].map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="rounded-el border border-gray-150 bg-paper px-[15px] py-3 text-left text-[0.87rem] leading-[1.4] text-gray-900 hover:border-ink"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
