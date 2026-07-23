import { getServerSession } from "next-auth";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import TasksOverview from "@/components/tasks/TasksOverview";
import { customerWhereForUser } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Aufgaben (kundenübergreifende Sicht): alle offenen Aufgaben der sichtbaren
// Kunden (Kernregel 3), sortiert nach Fälligkeit, plus Workflows, die auf
// Freigabe warten (Kernregel 2), und die zuletzt erledigten Aufgaben.

export default async function TasksPage() {
  const now = new Date();
  const session = await getServerSession(authOptions);
  const user = session!.user;
  const accessWhere = customerWhereForUser(user.id, user.role);
  const doneSince = new Date(now.getTime() - 14 * 86_400_000);

  const [openTasks, doneTasks, waitingWorkflows, totalNew] = await Promise.all([
    db.task.findMany({
      where: { status: "open", customer: accessWhere },
      include: { customer: true, assignee: true, workflowRun: true },
      orderBy: { createdAt: "desc" },
    }),
    db.task.findMany({
      where: { status: "done", customer: accessWhere, createdAt: { gte: doneSince } },
      include: { customer: true, assignee: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    db.workflowRun.findMany({
      where: { status: "waiting_approval", task: { customer: accessWhere } },
      include: { task: { include: { customer: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.signal.count({ where: { isNew: true, customer: accessWhere } }),
  ]);

  const toDto = (t: (typeof openTasks)[number] | (typeof doneTasks)[number]) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueAt: t.dueAt?.toISOString() ?? null,
    originLabel: t.originLabel,
    assigneeName: t.assignee?.name ?? null,
    customerName: t.customer.name,
    customerSlug: t.customer.slug,
    workflowStatus: "workflowRun" in t ? (t.workflowRun?.status ?? null) : null,
  });

  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <Sidebar
        active="/aufgaben"
        newCount={totalNew}
        userName={user.name ?? undefined}
        userRole={ROLE_LABELS[user.role] ?? user.role}
      />
      <main className="w-full max-w-[1240px] px-5 pb-28 md:px-12 md:pb-20">
        <Topbar hasNew={totalNew > 0} />
        <div className="mb-2 text-[0.78rem] font-medium uppercase tracking-[0.09em] text-gray-500">
          Aufgaben
        </div>
        <h1 className="mb-1.5 text-[2.1rem] leading-[1.15]">Aufgaben</h1>
        <p className="max-w-[640px] text-gray-500">
          Alle offenen Aufgaben über deine Kunden hinweg – aus Berichten, Signalen und Workflows.
          Zum Starten eines Workflows geht es auf die Kundenseite.
        </p>

        <TasksOverview
          open={openTasks.map(toDto)}
          done={doneTasks.map(toDto)}
          waiting={waitingWorkflows.map((w) => ({
            id: w.id,
            skillName: w.skillName,
            taskTitle: w.task.title,
            customerName: w.task.customer.name,
            customerSlug: w.task.customer.slug,
          }))}
          now={now.toISOString()}
        />
      </main>
    </div>
  );
}
