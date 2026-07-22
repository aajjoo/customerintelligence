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

/** Onboarding Schritt 3: bestätigten Profilvorschlag als Kunden anlegen (Etappe 4). */
export async function createCustomerFromProposal(proposal: {
  websiteUrl: string;
  name: string;
  industry: string;
  markets: string | null;
  competitors: string[];
  themes: string[];
  sources: { kind: "news" | "website"; label: string; url: string }[];
}): Promise<{ slug: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Nicht angemeldet");
  if (!["lead", "management", "admin"].includes(session.user.role)) {
    throw new Error("Kunden anlegen dürfen Account Leads, Management und Admin");
  }
  if (!proposal.name.trim() || !proposal.industry.trim()) {
    throw new Error("Name und Branche dürfen nicht leer sein");
  }

  const { slugify } = await import("@/lib/onboarding/slug");
  let slug = slugify(proposal.name) || "kunde";
  for (let i = 2; await db.customer.findUnique({ where: { slug } }); i++) {
    slug = `${slugify(proposal.name)}-${i}`;
  }

  const customer = await db.customer.create({
    data: {
      name: proposal.name.trim(),
      slug,
      industry: proposal.industry.trim(),
      markets: proposal.markets?.trim() || null,
      websiteUrl: proposal.websiteUrl,
      profileJson: JSON.stringify({
        competitors: proposal.competitors.filter((c) => c.trim()),
        themes: proposal.themes.filter((t) => t.trim()),
      }),
      sources: {
        create: proposal.sources.map((s) => ({ kind: s.kind, label: s.label, url: s.url })),
      },
      // Wer den Kunden anlegt, wird Account Lead des Kundenteams
      memberships: { create: { userId: session.user.id, isLead: true } },
    },
  });

  revalidatePath("/", "layout");
  return { slug: customer.slug };
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

/** Etappe 7: qualifizierte Opportunity als Deal an HubSpot übergeben (Konzept 4.3). */
export async function handOffToHubspot(opportunityId: string): Promise<{ dealId: string }> {
  const opp = await db.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: { customer: true },
  });
  await requireCustomerAccess(opp.customerId);
  if (opp.hubspotDealId) return { dealId: opp.hubspotDealId };

  const { createHubspotDeal } = await import("@/lib/integrations/hubspot");
  const dealId = await createHubspotDeal({
    title: opp.title,
    customerName: opp.customer.name,
    rationale: opp.rationale,
  });
  await db.opportunity.update({
    where: { id: opportunityId },
    data: { hubspotDealId: dealId },
  });
  revalidatePath("/", "layout");
  return { dealId };
}

/** Etappe 7: KPI-Werte per CSV importieren (kpi;periode;wert, Periode YYYY-MM). */
export async function importKpiValues(
  projectId: string,
  csv: string
): Promise<{ imported: number; errors: string[] }> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { kpis: true },
  });
  await requireCustomerAccess(project.customerId);

  const { parseKpiCsv } = await import("@/lib/integrations/kpi-import");
  const { rows, errors } = parseKpiCsv(csv);
  let imported = 0;

  for (const row of rows) {
    const kpi = project.kpis.find(
      (k) => k.label.toLowerCase() === row.kpiLabel.toLowerCase()
    );
    if (!kpi) {
      errors.push(`KPI "${row.kpiLabel}" existiert nicht im Projekt ${project.name}`);
      continue;
    }
    // ein Wert je KPI und Periode: bestehenden Wert ersetzen
    await db.kpiValue.deleteMany({ where: { kpiId: kpi.id, period: row.period } });
    await db.kpiValue.create({
      data: { kpiId: kpi.id, period: row.period, value: row.value },
    });
    imported++;
  }
  revalidatePath("/", "layout");
  return { imported, errors };
}

/** Prüft, ob der angemeldete Benutzer Account Lead des Kunden ist (bzw. Management/Admin). */
async function requireLead(customerId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Nicht angemeldet");
  const { id, role } = session.user;
  if (canSeeAllCustomers(role)) return;
  const membership = await db.teamMembership.findFirst({
    where: { userId: id, customerId, isLead: true },
  });
  if (!membership) {
    throw new Error("Die Freigabe ist dem Account Lead vorbehalten (Konzept 4.2)");
  }
}

/** Monatsbericht des Kunden generieren bzw. neu generieren (Etappe 5). */
export async function generateMonthlyReport(customerId: string) {
  await requireCustomerAccess(customerId);
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { generateReport } = await import("@/lib/report/generate");
  await generateReport(customerId, month);
  revalidatePath("/", "layout");
}

/**
 * Monatsbericht freigeben – nur Account Lead (bzw. Management/Admin).
 * Empfohlene Maßnahmen aus dem Bericht werden dabei als Aufgaben mit
 * Fälligkeit angelegt (Konzept 4.2: Maßnahmen direkt in Aufgaben überführen).
 */
export async function approveReport(reportId: string) {
  const report = await db.report.findUniqueOrThrow({ where: { id: reportId } });
  await requireLead(report.customerId);
  if (report.status === "approved") return;

  const { fmtReportMonth } = await import("@/lib/format");
  const monthLabel = fmtReportMonth(report.month).split(" ")[0];
  let suggested: { title: string; dueInDays: number }[] = [];
  try {
    suggested = JSON.parse(report.bodyJson ?? "{}").suggestedTasks ?? [];
  } catch {
    // Berichte ohne generierten Body (z. B. Seed) haben keine Maßnahmen
  }

  const now = new Date();
  for (const t of suggested) {
    await db.task.create({
      data: {
        customerId: report.customerId,
        title: t.title,
        originLabel: `aus Bericht ${monthLabel}`,
        dueAt: new Date(now.getTime() + Math.max(1, t.dueInDays) * 86_400_000),
      },
    });
  }

  await db.report.update({
    where: { id: reportId },
    data: { status: "approved", approvedAt: now },
  });
  revalidatePath("/", "layout");
}
