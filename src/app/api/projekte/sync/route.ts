import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { canSeeAllCustomers } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  fetchConfluencePages,
  fetchRecentIssues,
  fetchTicketStats,
  jiraConfigured,
  type ConfluenceExcerpt,
  type IssueExcerpt,
  type TicketStats,
} from "@/lib/integrations/jira";
import { runProjectHealth } from "@/lib/projects/health";

export const dynamic = "force-dynamic";
// Jira-Abruf + Claude-Einschätzung je Projekt (Konzept 5.1: synchron halten)
export const maxDuration = 120;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  let projectId: string;
  try {
    ({ projectId } = await request.json());
    if (!projectId) throw new Error();
  } catch {
    return NextResponse.json({ error: "projectId erforderlich" }, { status: 400 });
  }

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { customer: true },
  });
  if (!project) return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });

  if (!canSeeAllCustomers(session.user.role)) {
    const membership = await db.teamMembership.findFirst({
      where: { userId: session.user.id, customerId: project.customerId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Kunden" }, { status: 403 });
    }
  }

  const now = new Date();
  const notes: string[] = [];
  let stats: TicketStats | null = null;
  let issues: IssueExcerpt[] = [];
  let pages: ConfluenceExcerpt[] = [];

  // Jira/Confluence nur mit Konfiguration und hinterlegtem Projekt-Key
  if (jiraConfigured() && project.externalRef) {
    try {
      [stats, issues] = await Promise.all([
        fetchTicketStats(project.externalRef, now),
        fetchRecentIssues(project.externalRef),
      ]);
    } catch (e) {
      notes.push(`Jira: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      pages = await fetchConfluencePages(project.externalRef);
    } catch (e) {
      notes.push(`Confluence: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (!jiraConfigured()) {
    notes.push("Jira nicht konfiguriert – Einschätzung nur aus manuellen Daten");
  } else {
    notes.push("Kein Jira-Projekt-Key hinterlegt – Einschätzung nur aus manuellen Daten");
  }

  // Verbrauchte Stunden: Jira-Worklogs haben Vorrang vor manueller Pflege
  const spentHours = stats?.spentHours ?? project.spentHours;

  try {
    const health = await runProjectHealth({
      projectName: project.name,
      customerName: project.customer.name,
      phase: project.phase,
      budgetHours: project.budgetHours,
      spentHours,
      dbTargetPct: project.dbTargetPct,
      stats,
      issues,
      pages,
    });

    await db.project.update({
      where: { id: projectId },
      data: {
        status: health.status,
        spentHours,
        ticketStatsJson: stats ? JSON.stringify(stats) : project.ticketStatsJson,
        healthJson: JSON.stringify({ ...health, updatedAt: now.toISOString() }),
        syncedAt: now,
      },
    });

    return NextResponse.json({ health, stats, notes });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bewertung fehlgeschlagen", notes },
      { status: 502 }
    );
  }
}
