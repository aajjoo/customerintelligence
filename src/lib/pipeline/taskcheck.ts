// Erinnerung und Eskalation überfälliger Aufgaben (Etappe 5).
// Läuft im täglichen Pipeline-Lauf: überfällige Aufgaben erzeugen einmalig ein
// Erinnerungs- bzw. Eskalations-Signal der Dimension "Internes Lagebild".
// Reine Prüf-Logik (getestet), DB-Zugriff im Orchestrator.
import { fmtDay } from "../format.ts";

const DAY_MS = 86_400_000;
/** Ab so vielen Tagen Überfälligkeit wird eskaliert. */
export const ESCALATION_DAYS = 3;

export type TaskCheckInput = {
  taskId: string;
  title: string;
  status: string;
  dueAt: Date | null;
  assigneeName: string | null;
};

export type TaskSignalDraft = {
  kind: "reminder" | "escalation";
  contentHash: string;
  title: string;
  summary: string;
  sourceLabel: string;
  relevance: number;
};

/** Volle Tage Überfälligkeit (0 = heute fällig oder nicht überfällig). */
export function overdueDays(dueAt: Date, now: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(
    0,
    Math.round((startOfDay(now).getTime() - startOfDay(dueAt).getTime()) / DAY_MS)
  );
}

/**
 * Prüft eine Aufgabe: ≥1 Tag überfällig → Erinnerung, ≥ESCALATION_DAYS → Eskalation.
 * Der contentHash dedupliziert je Aufgabe und Stufe (einmal erinnern, einmal eskalieren).
 */
export function checkTask(task: TaskCheckInput, now: Date): TaskSignalDraft | null {
  if (task.status !== "open" || !task.dueAt) return null;
  const days = overdueDays(task.dueAt, now);
  if (days < 1) return null;

  const who = task.assigneeName ?? "Nicht zugewiesen";
  if (days >= ESCALATION_DAYS) {
    return {
      kind: "escalation",
      contentHash: `task:${task.taskId}:escalation`,
      title: `Aufgabe eskaliert: ${task.title}`,
      summary: `Die Aufgabe „${task.title}“ (${who}) ist seit ${days} Tagen überfällig (fällig ${fmtDay(task.dueAt)}). Bitte neu priorisieren oder neu zuweisen.`,
      sourceLabel: `Aufgabe · fällig ${fmtDay(task.dueAt)}`,
      relevance: 80,
    };
  }
  return {
    kind: "reminder",
    contentHash: `task:${task.taskId}:reminder`,
    title: `Aufgabe überfällig: ${task.title}`,
    summary: `Die Aufgabe „${task.title}“ (${who}) war am ${fmtDay(task.dueAt)} fällig und ist noch offen.`,
    sourceLabel: `Aufgabe · fällig ${fmtDay(task.dueAt)}`,
    relevance: 60,
  };
}
