import { getServerSession } from "next-auth";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ProjectsOverview from "@/components/projects/ProjectsOverview";
import { customerWhereForUser } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/i18n";
import { jiraConfigured } from "@/lib/integrations/jira";

export const dynamic = "force-dynamic";

// Projekte (kundenübergreifende Sicht, Konzept 5): alle laufenden Projekte der
// sichtbaren Kunden mit Ticket-Entwicklung (Jira), Stundenstand vs. Budget,
// KI-Einschätzung (Probleme + DB-Ziel, mit Quellen) und Anlage manuell oder
// per Jira-Import.

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user;
  const accessWhere = customerWhereForUser(user.id, user.role);

  const [projects, customers, totalNew] = await Promise.all([
    db.project.findMany({
      where: { customer: accessWhere },
      include: { customer: true, kpis: { include: { values: { orderBy: { period: "desc" }, take: 1 } } } },
      orderBy: [{ customer: { name: "asc" } }, { name: "asc" }],
    }),
    db.customer.findMany({ where: accessWhere, orderBy: { name: "asc" } }),
    db.signal.count({ where: { isNew: true, customer: accessWhere } }),
  ]);

  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <Sidebar
        active="/projekte"
        newCount={totalNew}
        userName={user.name ?? undefined}
        userRole={ROLE_LABELS[user.role] ?? user.role}
      />
      <main className="w-full max-w-[1240px] px-5 pb-28 md:px-12 md:pb-20">
        <Topbar hasNew={totalNew > 0} />
        <div className="mb-2 text-[0.78rem] font-medium uppercase tracking-[0.09em] text-gray-500">
          Projekte
        </div>
        <h1 className="mb-1.5 text-[2.1rem] leading-[1.15]">Projekte</h1>
        <p className="max-w-[680px] text-gray-500">
          Alle laufenden Projekte deiner Kunden: Ticket-Entwicklung aus Jira, verbrauchte vs.
          budgetierte Stunden und eine KI-Einschätzung zu Problemen und DB-Ziel – jede Aussage
          mit Quelle.
        </p>

        <ProjectsOverview
          jiraConfigured={jiraConfigured()}
          customers={customers.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            phase: p.phase,
            status: p.status,
            externalRef: p.externalRef,
            jiraUrl: p.jiraUrl,
            confluenceUrl: p.confluenceUrl,
            budgetHours: p.budgetHours,
            spentHours: p.spentHours,
            dbTargetPct: p.dbTargetPct,
            ticketStatsJson: p.ticketStatsJson,
            healthJson: p.healthJson,
            syncedAt: p.syncedAt?.toISOString() ?? null,
            customerName: p.customer.name,
            customerSlug: p.customer.slug,
            kpis: p.kpis.map((k) => ({
              label: k.label,
              unit: k.unit,
              latest: k.values[0]?.value ?? null,
              target: k.target,
            })),
          }))}
        />
      </main>
    </div>
  );
}
