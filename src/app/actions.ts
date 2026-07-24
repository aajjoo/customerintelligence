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

/**
 * Freigabe eines agentischen Workflows (Kernregel 2: nichts Externes ohne Freigabe).
 * Erst NACH der Freigabe wird ausgespielt (Slack, sofern konfiguriert);
 * jeder Schritt bleibt im Protokoll.
 */
export async function approveWorkflow(runId: string) {
  const run = await db.workflowRun.findUniqueOrThrow({
    where: { id: runId },
    include: { task: { include: { customer: true } } },
  });
  await requireCustomerAccess(run.task.customerId);
  if (run.status !== "waiting_approval") return;

  const { postToSlack, slackConfigured } = await import("@/lib/integrations/slack");
  const { stepsAfterApproval } = await import("@/lib/workflows/engine");

  let slack: "posted" | "skipped" = "skipped";
  if (slackConfigured() && run.draft) {
    try {
      await postToSlack(
        `*Marktradar – ${run.skillName} (${run.task.customer.name})* – freigegeben:\n${run.draft.slice(0, 2800)}`
      );
      slack = "posted";
    } catch {
      // Slack-Fehler: Freigabe bleibt gültig, Schritt bleibt als übersprungen dokumentiert
    }
  }

  await db.workflowRun.update({
    where: { id: runId },
    data: {
      status: "done",
      approvalAt: new Date(),
      stepsJson: JSON.stringify(stepsAfterApproval(slack)),
    },
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

// ---------- Verwaltung (Feedback-Runde) ----------

/** Kunde vollständig löschen (Verwaltung) – nur Account Lead bzw. Management/Admin. */
export async function deleteCustomer(customerId: string) {
  await requireLead(customerId);
  // Cascade von Hand (Schema hat keine onDelete-Regeln): Reihenfolge beachtet FKs
  await db.$transaction([
    db.chatMessage.deleteMany({ where: { customerId } }),
    db.workflowRun.deleteMany({ where: { task: { customerId } } }),
    db.task.deleteMany({ where: { customerId } }),
    db.opportunity.deleteMany({ where: { customerId } }),
    db.signal.deleteMany({ where: { customerId } }),
    db.kpiValue.deleteMany({ where: { kpi: { project: { customerId } } } }),
    db.kpi.deleteMany({ where: { project: { customerId } } }),
    db.project.deleteMany({ where: { customerId } }),
    db.report.deleteMany({ where: { customerId } }),
    db.source.deleteMany({ where: { customerId } }),
    db.teamMembership.deleteMany({ where: { customerId } }),
    db.customer.delete({ where: { id: customerId } }),
  ]);
  revalidatePath("/", "layout");
}

/** Recherche-Frequenz eines Kunden setzen (daily | weekly | off). */
export async function setResearchFrequency(customerId: string, frequency: string) {
  await requireCustomerAccess(customerId);
  if (!["daily", "weekly", "off"].includes(frequency)) {
    throw new Error("Frequenz muss daily, weekly oder off sein");
  }
  await db.customer.update({ where: { id: customerId }, data: { researchFrequency: frequency } });
  revalidatePath("/", "layout");
}

/** Quelle für einen Kunden anlegen (Verwaltung). */
export async function addSource(
  customerId: string,
  input: { kind: "news" | "website"; label: string; url: string }
) {
  await requireCustomerAccess(customerId);
  if (!input.label.trim() || !input.url.trim()) throw new Error("Label und URL erforderlich");
  new URL(input.url); // Validierung
  await db.source.create({
    data: { customerId, kind: input.kind, label: input.label.trim(), url: input.url.trim() },
  });
  revalidatePath("/", "layout");
}

/** Quelle aktivieren/deaktivieren bzw. löschen (Verwaltung). */
export async function toggleSource(sourceId: string) {
  const source = await db.source.findUniqueOrThrow({ where: { id: sourceId } });
  await requireCustomerAccess(source.customerId);
  await db.source.update({ where: { id: sourceId }, data: { active: !source.active } });
  revalidatePath("/", "layout");
}

export async function deleteSource(sourceId: string) {
  const source = await db.source.findUniqueOrThrow({ where: { id: sourceId } });
  await requireCustomerAccess(source.customerId);
  // Signale behalten ihren Quellenbezug über sourceLabel; FK lösen
  await db.signal.updateMany({ where: { sourceId }, data: { sourceId: null } });
  await db.source.delete({ where: { id: sourceId } });
  revalidatePath("/", "layout");
}

/** Benutzerrolle ändern – nur Management/Admin. */
export async function setUserRole(userId: string, role: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canSeeAllCustomers(session.user.role)) {
    throw new Error("Rollen ändern dürfen nur Management und Admin");
  }
  if (!["member", "lead", "management", "admin"].includes(role)) {
    throw new Error("Ungültige Rolle");
  }
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/", "layout");
}

/** Wirft, wenn der Benutzer das Team dieses Kunden nicht verwalten darf
 *  (Account Lead des Kunden oder Management/Admin). */
async function requireTeamAdmin(customerId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Nicht angemeldet");
  const { id, role } = session.user;
  if (canSeeAllCustomers(role)) return;
  const lead = await db.teamMembership.findFirst({
    where: { userId: id, customerId, isLead: true },
  });
  if (!lead) {
    throw new Error("Das Team ändern dürfen nur der Account Lead oder Management/Admin");
  }
}

/** Mitarbeiter dem Kundenteam zuordnen (Kernregel 3: Sichtbarkeit folgt dem Team). */
export async function addTeamMember(customerId: string, userId: string) {
  await requireTeamAdmin(customerId);
  await db.teamMembership.upsert({
    where: { userId_customerId: { userId, customerId } },
    create: { userId, customerId },
    update: {},
  });
  revalidatePath("/", "layout");
}

/** Lead-Status eines Teammitglieds setzen bzw. entziehen. */
export async function setTeamLead(membershipId: string, isLead: boolean) {
  const membership = await db.teamMembership.findUniqueOrThrow({
    where: { id: membershipId },
  });
  await requireTeamAdmin(membership.customerId);
  await db.teamMembership.update({ where: { id: membershipId }, data: { isLead } });
  revalidatePath("/", "layout");
}

/** Mitarbeiter aus dem Kundenteam entfernen (er verliert die Sicht auf den Kunden). */
export async function removeTeamMember(membershipId: string) {
  const membership = await db.teamMembership.findUniqueOrThrow({
    where: { id: membershipId },
  });
  await requireTeamAdmin(membership.customerId);
  await db.teamMembership.delete({ where: { id: membershipId } });
  revalidatePath("/", "layout");
}

/** Bereichs-Skill (Analyse-Anweisung) speichern; leerer Text deaktiviert den Bereich. */
export async function saveAreaSkill(areaKey: string, instruction: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Nicht angemeldet");
  if (!["lead", "management", "admin"].includes(session.user.role)) {
    throw new Error("Skills bearbeiten dürfen Account Leads, Management und Admin");
  }
  const existing = await db.skill.findFirst({ where: { scope: "area", name: areaKey } });
  if (existing) {
    await db.skill.update({
      where: { id: existing.id },
      data: { promptTmpl: instruction, active: instruction.trim().length > 0 },
    });
  } else if (instruction.trim()) {
    await db.skill.create({
      data: { scope: "area", name: areaKey, promptTmpl: instruction, outputKind: null },
    });
  }
  revalidatePath("/", "layout");
}

/** Recherche-Skill anlegen/bearbeiten (Skills-Seite) – steuert die automatische Websuche. */
export async function saveResearchSkill(input: {
  id?: string;
  name: string;
  promptTmpl: string;
  active: boolean;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["lead", "management", "admin"].includes(session.user.role)) {
    throw new Error("Skills bearbeiten dürfen Account Leads, Management und Admin");
  }
  if (!input.name.trim()) throw new Error("Name erforderlich");
  const data = {
    name: input.name.trim(),
    promptTmpl: input.promptTmpl.trim() || null,
    active: input.active,
    scope: "research",
  };
  if (input.id) await db.skill.update({ where: { id: input.id }, data });
  else await db.skill.create({ data });
  revalidatePath("/", "layout");
}

/** Recherche-Skill löschen. */
export async function deleteResearchSkill(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["lead", "management", "admin"].includes(session.user.role)) {
    throw new Error("Skills bearbeiten dürfen Account Leads, Management und Admin");
  }
  const skill = await db.skill.findUniqueOrThrow({ where: { id } });
  if (skill.scope !== "research") throw new Error("Kein Recherche-Skill");
  await db.skill.delete({ where: { id } });
  revalidatePath("/", "layout");
}

/** Workflow-Skill anlegen/bearbeiten (Skills-Seite). */
export async function saveWorkflowSkill(input: {
  id?: string;
  name: string;
  description: string;
  promptTmpl: string;
  outputKind: string;
  active: boolean;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["lead", "management", "admin"].includes(session.user.role)) {
    throw new Error("Skills bearbeiten dürfen Account Leads, Management und Admin");
  }
  if (!input.name.trim()) throw new Error("Name erforderlich");
  const data = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    promptTmpl: input.promptTmpl.trim() || null,
    outputKind: input.outputKind || null,
    active: input.active,
    scope: "org",
  };
  if (input.id) await db.skill.update({ where: { id: input.id }, data });
  else await db.skill.create({ data });
  revalidatePath("/", "layout");
}

/** Projekt mit KPI-Definitionen anlegen (Projekte-Tab). */
export async function createProject(
  customerId: string,
  input: {
    name: string;
    description: string;
    phase: string;
    status: string;
    // Ziel-URLs & Wirtschaftlichkeit (Feedback-Runde 2): Jira-Key/URLs, Stundenbudget, DB-Ziel
    externalRef?: string;
    jiraUrl?: string;
    confluenceUrl?: string;
    budgetHours?: string;
    spentHours?: string;
    dbTargetPct?: string;
    kpis: { label: string; unit: string; target: string; threshold: string; direction: string }[];
  }
) {
  await requireCustomerAccess(customerId);
  if (!input.name.trim()) throw new Error("Projektname erforderlich");
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  await db.project.create({
    data: {
      customerId,
      name: input.name.trim(),
      description: input.description.trim() || null,
      phase: input.phase.trim() || null,
      externalRef: input.externalRef?.trim() || null,
      jiraUrl: input.jiraUrl?.trim() || null,
      confluenceUrl: input.confluenceUrl?.trim() || null,
      budgetHours: num(input.budgetHours ?? ""),
      spentHours: num(input.spentHours ?? ""),
      dbTargetPct: num(input.dbTargetPct ?? ""),
      status: ["ok", "watch", "critical"].includes(input.status) ? input.status : "ok",
      kpis: {
        create: input.kpis
          .filter((k) => k.label.trim())
          .map((k) => ({
            label: k.label.trim(),
            unit: k.unit.trim() || null,
            target: num(k.target),
            threshold: num(k.threshold),
            direction: k.direction === "down" ? "down" : "up",
          })),
      },
    },
  });
  revalidatePath("/", "layout");
}

// Der manuelle Pipeline-Lauf läuft als API-Route /api/pipeline/kunde
// (maxDuration 300) – als Server-Action brach er am Function-Timeout ab.

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

/** Wirtschaftlichkeit & Ziel-URLs eines Projekts pflegen (Feedback-Runde 2). */
export async function updateProjectEconomics(
  projectId: string,
  input: {
    externalRef: string;
    jiraUrl: string;
    confluenceUrl: string;
    budgetHours: string;
    spentHours: string;
    dbTargetPct: string;
    phase: string;
  }
) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  await requireCustomerAccess(project.customerId);
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  await db.project.update({
    where: { id: projectId },
    data: {
      externalRef: input.externalRef.trim() || null,
      jiraUrl: input.jiraUrl.trim() || null,
      confluenceUrl: input.confluenceUrl.trim() || null,
      budgetHours: num(input.budgetHours),
      spentHours: num(input.spentHours),
      dbTargetPct: num(input.dbTargetPct),
      phase: input.phase.trim() || null,
    },
  });
  revalidatePath("/", "layout");
}

/** Projekt löschen (samt KPIs und Werten). */
export async function deleteProject(projectId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  await requireCustomerAccess(project.customerId);
  await db.$transaction([
    db.kpiValue.deleteMany({ where: { kpi: { projectId } } }),
    db.kpi.deleteMany({ where: { projectId } }),
    db.project.delete({ where: { id: projectId } }),
  ]);
  revalidatePath("/", "layout");
}

/** Jira-Projekte als Marktradar-Projekte übernehmen (Konzept 5.1: führendes System). */
export async function importJiraProjects(
  items: { key: string; name: string; url: string; customerId: string }[]
) {
  const { jiraConfigured } = await import("@/lib/integrations/jira");
  if (!jiraConfigured()) throw new Error("Jira ist nicht konfiguriert (JIRA_* Env-Variablen)");
  let created = 0;
  for (const item of items) {
    await requireCustomerAccess(item.customerId);
    const exists = await db.project.findFirst({ where: { externalRef: item.key } });
    if (exists) continue;
    await db.project.create({
      data: {
        customerId: item.customerId,
        name: item.name,
        externalRef: item.key,
        jiraUrl: item.url,
        description: `Aus Jira übernommen (${item.key})`,
      },
    });
    created++;
  }
  revalidatePath("/", "layout");
  return { created };
}
