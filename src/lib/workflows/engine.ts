// Workflow-Framework (Etappe 8, Konzept Kap. 7): Skills sind in der DB definiert
// (Name, Beschreibung, Prompt-Template, Output-Art) – neue Workflows brauchen
// kein Deployment. Jeder Lauf protokolliert seine Schritte (Kernregel 2);
// nichts Externes passiert ohne menschliche Freigabe.
// Reine Schritt-/Prompt-Logik (getestet); DB und Claude im Aufrufer.

export type WorkflowStep = { step: string; status: "done" | "active" | "pending"; note?: string };

export type SkillDef = {
  name: string;
  description: string | null;
  promptTmpl: string | null;
  outputKind: string | null; // briefing | report | email | slack | table
};

/** Schritte beim Start eines Laufs. */
export function initialSteps(): WorkflowStep[] {
  return [
    { step: "Signale & Quellen sammeln", status: "active" },
    { step: "Entwurf erstellen", status: "pending" },
    { step: "Entwurf zur Freigabe", status: "pending" },
    { step: "Ausspielung (Slack)", status: "pending" },
  ];
}

/** Schritte nachdem der Entwurf erzeugt wurde → wartet auf Freigabe. */
export function stepsAfterDraft(sourceCount: number, draftChars: number): WorkflowStep[] {
  return [
    { step: "Signale & Quellen sammeln", status: "done", note: `${sourceCount} Einträge ausgewertet` },
    { step: "Entwurf erstellen", status: "done", note: `${Math.round(draftChars / 1000)} k Zeichen` },
    { step: "Entwurf zur Freigabe", status: "active", note: "wartet auf menschliche Freigabe" },
    { step: "Ausspielung (Slack)", status: "pending" },
  ];
}

/** Schritte nach der Freigabe (Kernregel 2: Externes erst jetzt). */
export function stepsAfterApproval(slack: "posted" | "skipped"): WorkflowStep[] {
  return [
    { step: "Signale & Quellen sammeln", status: "done" },
    { step: "Entwurf erstellen", status: "done" },
    { step: "Entwurf zur Freigabe", status: "done", note: "freigegeben" },
    {
      step: "Ausspielung (Slack)",
      status: "done",
      note: slack === "posted" ? "in Slack gepostet" : "übersprungen (Slack nicht konfiguriert)",
    },
  ];
}

/** Baut den Generierungs-Prompt aus Skill-Template + Radar-Material (rein, getestet). */
export function buildWorkflowPrompt(
  skill: SkillDef,
  customerName: string,
  taskTitle: string,
  chunks: { kind: string; text: string; source: string }[]
): string {
  const material = chunks
    .map((c, i) => `[${i + 1}] (${c.kind} · Quelle: ${c.source}) ${c.text}`)
    .join("\n");

  const instruction =
    skill.promptTmpl ??
    `Erstelle ein Arbeitsdokument der Art "${skill.outputKind ?? "briefing"}" zum Thema der Aufgabe.`;

  return `${instruction}

## Kunde
${customerName}

## Aufgabe
${taskTitle}

## Radar-Material (einzige Faktenbasis)
${material || "kein Material vorhanden"}

Regeln:
- Nur Aussagen aus dem Radar-Material; jede faktische Aussage mit (Quelle: …) kennzeichnen.
- Deutsch, direkt verwendbar (keine Meta-Kommentare).
- Struktur mit kurzen Überschriften/Absätzen; bei E-Mails Betreff + Anrede + Gruß.`;
}

export const WORKFLOW_SYSTEM_PROMPT = `Du bist das Workflow-Framework des Netural Marktradars. Du erstellst Arbeitsdokumente (Briefings, Vergleiche, E-Mail-Entwürfe) für Kundenteams ausschließlich aus dem mitgelieferten Radar-Material – nichts wird erfunden, jede Aussage trägt ihre Quelle. Du antwortest ausschließlich mit dem geforderten JSON.`;

export const WORKFLOW_SCHEMA = {
  type: "object",
  properties: {
    draft: {
      type: "string",
      description: "Das fertige Dokument (deutsch, mit Quellenangaben im Text)",
    },
  },
  required: ["draft"],
  additionalProperties: false,
} as const;
