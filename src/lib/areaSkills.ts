// Bereichs-Skills: editierbare Analyse-Anweisungen des Teams je Funktionsbereich,
// gespeichert als Skill (scope="area", name=Bereichsschlüssel, promptTmpl=Anweisung).
// Sie fließen in die jeweiligen Claude-Prompts ein und steuern so die AI-Analyse
// ohne Deployment. Das Leistungsportfolio ist ebenfalls hier editierbar.
export const AREAS: { key: string; label: string; hint: string }[] = [
  {
    key: "leistungsportfolio",
    label: "Netural-Leistungsportfolio",
    hint: "Referenz für Relevanzbewertung und Anknüpfungspunkte (Pipeline, Bericht, Workflows). Ersetzt den eingebauten Standardtext.",
  },
  {
    key: "scoring",
    label: "Radar / Signal-Bewertung",
    hint: "Zusätzliche Anweisungen für das Claude-Scoring der Pipeline (z. B. Themen priorisieren, Quellenarten abwerten).",
  },
  {
    key: "bericht",
    label: "Monatsbericht",
    hint: "Zusätzliche Anweisungen für die Berichtgenerierung (z. B. Tonalität, Pflichtabschnitte, Fokus).",
  },
  {
    key: "chat",
    label: "Chat",
    hint: "Zusätzliche Anweisungen für Chat-Antworten (z. B. Antwortformat, Detailtiefe).",
  },
  {
    key: "onboarding",
    label: "Kunden-Onboarding",
    hint: "Zusätzliche Anweisungen für die Profilextraktion neuer Kunden.",
  },
];

/** Anweisung eines Bereichs laden (null, wenn nicht gesetzt/aktiv).
 *  DB lazy importiert, damit die reinen Teile des Moduls unter node --test laufen. */
export async function getAreaInstruction(key: string): Promise<string | null> {
  const { db } = await import("@/lib/db");
  const skill = await db.skill.findFirst({
    where: { scope: "area", name: key, active: true },
  });
  return skill?.promptTmpl?.trim() || null;
}

/** Formatiert eine Team-Anweisung als Prompt-Zusatz (leer, wenn keine gesetzt). */
export function instructionBlock(instruction: string | null): string {
  if (!instruction) return "";
  return `\n\n## Zusätzliche Anweisungen des Teams (verbindlich)\n${instruction}`;
}
