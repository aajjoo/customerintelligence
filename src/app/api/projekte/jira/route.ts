import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { jiraConfigured, listJiraProjects } from "@/lib/integrations/jira";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Liste der Jira-Projekte für den Import-Vorschlag (Konzept 5.1):
// bereits übernommene Keys werden markiert.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!jiraConfigured()) {
    return NextResponse.json({ configured: false, projects: [] });
  }
  try {
    const [jiraProjects, existing] = await Promise.all([
      listJiraProjects(),
      db.project.findMany({
        where: { externalRef: { not: null } },
        select: { externalRef: true },
      }),
    ]);
    const known = new Set(existing.map((p) => p.externalRef));
    return NextResponse.json({
      configured: true,
      projects: jiraProjects.map((p) => ({ ...p, imported: known.has(p.key) })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Jira-Abruf fehlgeschlagen" },
      { status: 502 }
    );
  }
}
