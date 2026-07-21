"use client";

import { useState } from "react";

// Modal "Kunde hinzufügen" laut Prototyp: URL → Profilvorschlag → bestätigen.
// Die Extraktion (Crawl + Profilvorschlag) kommt in Etappe 4; hier Demo-Ablauf mit Beispieldaten.

const DEMO_ROWS = [
  ["Unternehmen", "Alpina Retail GmbH · Handel / Sport & Outdoor"],
  ["Märkte", "Österreich, Deutschland, Schweiz · 84 Filialen + Onlineshop"],
  ["Quellen erkannt", "Pressebereich, Karriereseite, LinkedIn, Investor Relations"],
  ["Mitbewerber-Kandidaten", "SportOn, Bergzeit Retail, IntersportAlpin (bitte prüfen)"],
  ["Strategische Themen", "Omnichannel, Loyalty, Nachhaltigkeitsberichterstattung"],
  ["Aus HubSpot ergänzt", "2 Kontakte, 1 offener Deal, Kundenteam C vorgeschlagen"],
];

export default function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("https://www.alpina-retail.example");
  const [phase, setPhase] = useState<"input" | "loading" | "extracted">("input");

  function extract() {
    if (phase === "input") {
      setPhase("loading");
      setTimeout(() => setPhase("extracted"), 900);
    } else if (phase === "extracted") {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-5"
      onClick={onClose}
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
          className="w-full rounded-el border border-gray-300 px-4 py-3 font-sans text-base outline-none focus:border-ink"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.kunde.com"
        />
        {phase === "extracted" && (
          <div className="mt-5">
            {DEMO_ROWS.map(([k, v]) => (
              <div key={k} className="flex gap-3 border-b border-gray-75 py-2.5 text-[0.9rem]">
                <div className="w-[150px] flex-shrink-0 text-gray-500">{k}</div>
                <div className="font-normal">{v}</div>
              </div>
            ))}
            <p className="mt-3 text-[0.78rem] text-gray-500">
              Demo-Daten – die echte Profilextraktion folgt in Etappe 4 (Kunden-Onboarding).
            </p>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2.5">
          <button
            className="rounded-el border border-gray-300 px-5 py-2.5 text-[0.9rem] font-medium hover:bg-gray-75"
            onClick={onClose}
          >
            Abbrechen
          </button>
          <button
            className="rounded-el bg-ink px-5 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-gray-900"
            onClick={extract}
          >
            {phase === "input" && "Profil extrahieren"}
            {phase === "loading" && "Analysiere Website …"}
            {phase === "extracted" && "Kunde anlegen & Radar starten"}
          </button>
        </div>
      </div>
    </div>
  );
}
