"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessageDTO, CustomerDTO } from "@/components/customer/types";

// Tab Chat (Etappe 6, Konzept 4.5): Fragen an den Radar. Antworten kommen aus
// /api/chat (Retrieval über Signale/Berichte/Projekte/Opportunities + Claude),
// jede Antwort trägt Quellen-Chips (Kernregel 1). Verlauf je Kunde und User.

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
    "Wie ist die Gesamtlage bei diesem Kunden?",
  ],
};

const ROLES = [
  { key: "lead", label: "Account Lead" },
  { key: "member", label: "Teammitglied" },
  { key: "mgmt", label: "Management" },
];

export default function ChatTab({ customer }: { customer: CustomerDTO }) {
  const [msgs, setMsgs] = useState<ChatMessageDTO[]>(customer.chatHistory);
  const [input, setInput] = useState("");
  const [role, setRole] = useState("lead");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [msgs, pending]);

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || pending) return;
    setInput("");
    setError(null);
    setMsgs((m) => [...m, { role: "user", content: question, sources: [] }]);
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerId: customer.id, question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Antwort fehlgeschlagen");
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: data.answer, sources: data.sources ?? [] },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Antwort fehlgeschlagen");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid items-start gap-9 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-[540px] flex-col rounded-card border border-gray-150">
        <div ref={logRef} className="flex max-h-[600px] flex-1 flex-col gap-[18px] overflow-y-auto p-[26px]">
          {msgs.length === 0 && (
            <div className="max-w-[78%] self-start rounded-[14px] rounded-bl-[4px] bg-gray-75 px-[17px] py-[13px] text-[0.92rem] leading-relaxed">
              Frag den Radar zur Lage bei {customer.name} – zu Signalen, Projekten, KPIs,
              Opportunities oder Aufgaben. Jede Antwort trägt Quellenangaben.
            </div>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`max-w-[78%] whitespace-pre-line rounded-[14px] px-[17px] py-[13px] text-[0.92rem] leading-relaxed ${
                m.role === "user"
                  ? "self-end rounded-br-[4px] bg-ink text-paper"
                  : "self-start rounded-bl-[4px] bg-gray-75"
              }`}
            >
              {m.content}
              {m.sources.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2 text-[0.76rem] text-gray-500">
                  {m.sources.map((s) => (
                    <span key={s} className="rounded-[5px] border border-gray-150 bg-paper px-2 py-0.5">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {pending && (
            <div className="max-w-[78%] self-start rounded-[14px] rounded-bl-[4px] bg-gray-75 px-[17px] py-[13px] text-[0.92rem] text-gray-500">
              Der Radar durchsucht Signale, Berichte und Projekte …
            </div>
          )}
          {error && <p className="text-[0.85rem] text-neg">{error}</p>}
        </div>
        <div className="flex gap-2.5 border-t border-gray-150 p-4">
          <input
            className="flex-1 rounded-el border border-gray-150 px-[15px] py-[11px] font-sans text-[0.92rem] outline-none focus:border-ink"
            placeholder={`Frage zu ${customer.name} stellen …`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={pending}
          />
          <button
            className="rounded-el bg-ink px-5 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-gray-900 disabled:opacity-50"
            onClick={() => send()}
            disabled={pending || !input.trim()}
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
            disabled={pending}
            className="rounded-el border border-gray-150 bg-paper px-[15px] py-3 text-left text-[0.87rem] leading-[1.4] text-gray-900 hover:border-ink disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
