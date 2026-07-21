"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { canSeeAllCustomers } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Server-Actions für die UI-Interaktionen der Etappe 2 (Review, Aufgaben, Freigaben).
// Jede Mutation prüft die Team-Zugehörigkeit (Kernregel 3), Tests in tests/access.test.ts.

/** Wirft, wenn der angemeldete Benutzer den Kunden nicht sehen darf. */
async function requireCustomerAccess(customerId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Nicht angemeldet");
  const { id, role } = session.user;
  if (!canSeeAllCustomers(role)) {
    const membership = await db.teamMembership.findFirst({
      where: { userId: id, customerId },
    });
    if (!membership) throw new Error("Kein Zugriff auf diesen Kunden");
  }
}

/** Signal-Review direkt auf der Karte: Relevant / Irrelevant. Neu-Markierung verschwindet nach Sichtung. */
export async function reviewSignal(signalId: string, verdict: "relevant" | "irrelevant") {
  const signal = await db.signal.findUniqueOrThrow({ where: { id: signalId } });
  await requireCustomerAccess(signal.customerId);
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
  await requireCustomerAccess(signal.customerId);
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
  await requireCustomerAccess(signal.customerId);
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
  await requireCustomerAccess(task.customerId);
  await db.task.update({
    where: { id: taskId },
    data: { status: task.status === "done" ? "open" : "done" },
  });
  revalidatePath("/", "layout");
}

/** Freigabe eines agentischen Workflows (Kernregel 2: nichts Externes ohne Freigabe). */
export async function approveWorkflow(runId: string) {
  const run = await db.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    include: { task: true },
  });
  await requireCustomerAccess(run.task.customerId);
  await db.workflowRun.update({
    where: { id: runId },
    data: { status: "approved", approvalAt: new Date() },
  });
  revalidatePath("/", "layout");
}

/** Pipeline manuell für einen Kunden anstoßen (Quellen abrufen, bewerten, Review-Queue). */
export async function runPipelineForCustomer(customerId: string) {
  await requireCustomerAccess(customerId);
  const { runPipeline } = await import("@/lib/pipeline/run");
  const result = await runPipeline({ customerId, trigger: "manual" });
  revalidatePath("/", "layout");
  const stats = result.stats[0];
  return {
    created: stats?.created ?? 0,
    discarded: stats?.discarded ?? 0,
    kpiSignals: stats?.kpiSignals ?? 0,
    fetched: stats?.fetched ?? 0,
    errors: stats?.errors ?? [],
  };
}

/** Monatsbericht freigeben (Account Lead). */
export async function approveReport(reportId: string) {
  const report = await db.report.findUniqueOrThrow({ where: { id: reportId } });
  await requireCustomerAccess(report.customerId);
  await db.report.update({
    where: { id: reportId },
    data: { status: "approved", approvedAt: new Date() },
  });
  revalidatePath("/", "layout");
}
