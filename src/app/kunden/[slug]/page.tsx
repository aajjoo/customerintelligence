import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import CustomerView from "@/components/customer/CustomerView";
import type { CustomerDTO, WorkflowStepDTO } from "@/components/customer/types";
import { customerWhereForUser } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { lastMonths } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Screen 2 "Kundenseite": lädt alle Daten des Kunden und übergibt sie als
// serialisierbares DTO an die Client-Ansicht mit den 5 Tabs (siehe design-spec.md).
// Zugriff nur für zugeordnete Teams bzw. Management/Admin (Kernregel 3).

export default async function CustomerPage({ params }: { params: { slug: string } }) {
  const now = new Date();
  const session = await getServerSession(authOptions);
  const user = session!.user;
  const accessWhere = customerWhereForUser(user.id, user.role);
  const globalNew = await db.signal.count({
    where: { isNew: true, customer: accessWhere },
  });
  const customer = await db.customer.findFirst({
    where: { slug: params.slug, ...accessWhere },
    include: {
      signals: { orderBy: [{ occurredAt: "desc" }] },
      projects: {
        orderBy: { createdAt: "asc" },
        include: { kpis: { include: { values: { orderBy: { period: "asc" } } } } },
      },
      opportunities: { orderBy: { updatedAt: "desc" } },
      tasks: {
        orderBy: [{ status: "desc" }, { dueAt: "asc" }], // offene zuerst, erledigte unten
        include: { assignee: true, workflowRun: true },
      },
      reports: { orderBy: { month: "desc" }, take: 1 },
      memberships: { where: { isLead: true }, include: { user: true } },
    },
  });
  if (!customer) notFound();

  const monthFmt = new Intl.DateTimeFormat("de-AT", { month: "short" });
  const monthly = lastMonths(6, now).map((m) => {
    const end = new Date(m.start.getFullYear(), m.start.getMonth() + 1, 1);
    const inMonth = customer.signals.filter((s) => s.occurredAt >= m.start && s.occurredAt < end);
    return { label: m.label, total: inMonth.length, hot: inMonth.filter((s) => s.relevance >= 80).length };
  });

  let competitors: string[] = [];
  try {
    competitors = JSON.parse(customer.profileJson ?? "{}").competitors ?? [];
  } catch {
    // profileJson ist optional; ohne Profil kein Mitbewerber-Panel
  }

  const dto: CustomerDTO = {
    id: customer.id,
    name: customer.name,
    slug: customer.slug,
    industry: customer.industry,
    markets: customer.markets,
    teamLabel: customer.teamLabel,
    radarSince: customer.radarSince.toISOString(),
    leadName: customer.memberships[0]?.user.name ?? null,
    competitors,
    signals: customer.signals.map((s) => ({
      id: s.id,
      dimension: s.dimension,
      title: s.title,
      summary: s.summary,
      sourceLabel: s.sourceLabel,
      sourceUrl: s.sourceUrl,
      relevance: s.relevance,
      isNew: s.isNew,
      isKpiSignal: s.isKpiSignal,
      review: s.review,
      occurredAt: s.occurredAt.toISOString(),
    })),
    projects: customer.projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      phase: p.phase,
      status: p.status,
      externalRef: p.externalRef,
      kpis: p.kpis.map((k) => ({
        id: k.id,
        label: k.label,
        unit: k.unit,
        target: k.target,
        threshold: k.threshold,
        direction: k.direction,
        values: k.values.map((v) => ({ label: monthFmt.format(v.period), value: v.value })),
      })),
    })),
    opportunities: customer.opportunities.map((o) => ({
      id: o.id,
      title: o.title,
      stage: o.stage,
      ownerLabel: o.ownerLabel,
      rationale: o.rationale,
      updatedAt: o.updatedAt.toISOString(),
    })),
    tasks: customer.tasks.map((t) => {
      let steps: WorkflowStepDTO[] = [];
      if (t.workflowRun) {
        try {
          steps = JSON.parse(t.workflowRun.stepsJson);
        } catch {
          steps = [];
        }
      }
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        originLabel: t.originLabel,
        dueAt: t.dueAt?.toISOString() ?? null,
        assigneeName: t.assignee?.name ?? null,
        workflow: t.workflowRun
          ? {
              id: t.workflowRun.id,
              skillName: t.workflowRun.skillName,
              status: t.workflowRun.status,
              steps,
              taskTitle: t.title,
            }
          : null,
      };
    }),
    report: customer.reports[0]
      ? (() => {
          const r = customer.reports[0];
          let body: { sections?: { title: string; text: string }[]; suggestedTasks?: { title: string; dueInDays: number; reason: string }[] } = {};
          try {
            body = JSON.parse(r.bodyJson ?? "{}");
          } catch {
            // Alt-Berichte ohne validen Body → berechnete Abschnitte im Tab
          }
          return {
            id: r.id,
            month: r.month,
            execSummary: r.execSummary,
            status: r.status,
            sections: body.sections ?? null,
            suggestedTasks: body.suggestedTasks ?? null,
          };
        })()
      : null,
    monthly,
    now: now.toISOString(),
  };

  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <Sidebar
        active="/"
        newCount={globalNew}
        userName={user.name ?? undefined}
        userRole={ROLE_LABELS[user.role] ?? user.role}
      />
      <main className="w-full max-w-[1240px] px-5 pb-28 md:px-12 md:pb-20">
        <Topbar hasNew={globalNew > 0} />
        <CustomerView customer={dto} />
      </main>
    </div>
  );
}
