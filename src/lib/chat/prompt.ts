// Reiner Prompt-Aufbau für den Chat (Etappe 6) – ohne DB/SDK, unter node --test lauffähig.

export type ChunkForPrompt = { kind: string; text: string; source: string };

/** Baut den User-Prompt aus Frage + nummeriertem Kontext (rein, getestet). */
export function buildChatPrompt(
  customerName: string,
  chunks: ChunkForPrompt[],
  question: string
): string {
  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.kind} · Quelle: ${c.source}) ${c.text}`)
    .join("\n");

  return `Beantworte die Frage des Kundenteams zu ${customerName} ausschließlich auf Basis des folgenden Radar-Materials.

## Radar-Material
${context || "kein Material vorhanden"}

## Frage
${question}

Regeln:
- Nur Aussagen, die durch das Material belegt sind. Wenn das Material die Frage nicht beantwortet, sage das klar.
- sources: die Quellen (Feld "Quelle" der verwendeten Einträge), auf die sich die Antwort stützt – ohne Quelle keine Aussage.
- Antworte auf Deutsch, kompakt und strukturiert (Absätze oder nummerierte Punkte, kein Markdown-Overhead).`;
}

export const CHAT_SYSTEM_PROMPT = `Du bist der Chat des Netural Marktradars, einer Kundenintelligenz-Plattform für Agentur-Kundenteams. Du beantwortest Fragen zur Lage eines Kunden aus Signalen, Berichten, Projekten, KPIs, Opportunities und Aufgaben. Jede Aussage stützt sich auf das mitgelieferte Material; du erfindest nichts. Du antwortest ausschließlich mit dem geforderten JSON.`;

export const CHAT_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "Antwort auf Deutsch, kompakt und belegt" },
    sources: {
      type: "array",
      items: { type: "string" },
      description: "Quellenangaben der verwendeten Einträge (dedupliziert)",
    },
  },
  required: ["answer", "sources"],
  additionalProperties: false,
} as const;
