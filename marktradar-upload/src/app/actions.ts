"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

// Server-Actions für die UI-Interaktionen der Etappe 2 (Review, Aufgaben, Freigaben).
// Rechteprüfung pro Kundenteam folgt mit dem Google-Login (siehe Etappenplan).

/** Signal-Review direkt auf der Karte: Relevant / Irrelevant. Neu-Markierung verschwindet nach Sichtung. */
export async function reviewSignal(signalId: string, verdict: "relevant" | "irrelevant") {
  await db.signal.update({
    where: { id: signalId },
    data: { review: verdict, isNew: false },
  });
  revalidatePath("/", "layout");
}

/** Signal → Opportunity: behält den Quellenbezug (Kernregel 4). */
export async function signalToOpportunity(signalId: string) {
  const signal = await db.signal.findUniqueOrThrow({
    where: { id: signalId },
    include: { opportunity: true },
  });
  if (!signal.opportunity) {
    await db.opportunity.create({
      data: {
        customerId: signal.customerId,
        signalId: signal.id,
        title: signal.title,
        rationale: signal.sourceLabel ? `aus Signal: ${signal.sourceLabel}` : "aus Signal",
        stage: "new",
      },
    });
  }
  await db.signal.update({
    where: { id: signalId },
    data: { review: "relevant", isNew: false },
  });
  revalidatePath("/", "layout");
}

/** Signal → Aufgabe (z. B. KPI-Signal): behält den Quellenbezug über originLabel. */
export async function signalToTask(signalId: string) {
  const signal = await db.signal.findUniqueOrThrow({ where: { id: signalId } });
  await db.task.create({
    data: {
      customerId: signal.customerId,
      title: signal.title,
      originLabel: signal.isKpiSignal ? "aus KPI-Signal" : "aus Radar",
    },
  });
  await db.signal.update({
    where: { id: signalId },
    data: { review: "relevant", isNew: false },
  });
  revalidatePath("/", "layout");
}

/** Aufgabe abhaken / wieder öffnen. */
export async function toggleTask(taskId: string) {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  await db.task.update({
    where: { id: taskId },
    data: { status: task.status === "done" ? "open" : "done" },
  });
  revalidatePath("/", "layout");
}

/** Freigabe eines agentischen Workflows (Kernregel 2: nichts Externes ohne Freigabe). */
export async function approveWorkflow(runId: string) {
  await db.workflowRun.update({
    where: { id: runId },
    data: { status: "approved", approvalAt: new Date() },
  });
  revalidatePath("/", "layout");
}

/** Monatsbericht freigeben (Account Lead). */
export async function approveReport(reportId: string) {
  await db.report.update({
    where: { id: reportId },
    data: { status: "approved", approvedAt: new Date() },
  });
  revalidatePath("/", "layout");
}
