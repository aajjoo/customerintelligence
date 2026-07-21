import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import Sparkline from "@/components/Sparkline";
import { db } from "@/lib/db";
import { fmtFullDate, greeting, lastMonths } from "@/lib/format";

export const dynamic = "force-dynamic";

// Screen 1 "Meine Kunden": Begrüßung + Tageszusammenfassung, Kundenkarten-Grid.
// Angemeldeter Benutzer kommt mit dem Google-Login; bis dahin der Seed-Lead.

export default async function HomePage() {
  const now = new Date();
  const [user, customers] = await Promise.all([
    db.user.findFirst({ where: { role: "lead" } }),
    db.customer.findMany({
      orderBy: { name: "asc" },
      include: {
        signals: { orderBy: { occurredAt: "desc" } },
        opportunities: { where: { stage: { notIn: ["won", "dropped"] } } },
        tasks: { where: { status: "open" } },
        projects: true,
      },
    }),
  ]);

  const totalNew = customers.reduce((n, c) => n + c.signals.filter((s) => s.isNew).length, 0);
  const oppsToReview = customers.reduce(
    (n, c) => n + c.opportunities.filter((o) => o.stage === "new").length,
    0
  );
  const overdue = customers.reduce(
    (n, c) => n + c.tasks.filter((t) => t.dueAt && t.dueAt < now).length,
    0
  );
  const months = lastMonths(9, now);
  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <Sidebar active="/" newCount={totalNew} userName={user?.name} />
      <main className="w-full max-w-[1240px] px-5 pb-28 md:px-12 md:pb-20">
        <Topbar hasNew={totalNew > 0} />

        <div className="mb-2 text-[0.78rem] font-medium uppercase tracking-[0.09em] text-gray-500">
          {fmtFullDate(now)}
        </div>
        <h1 className="mb-1.5 text-[2.1rem] leading-[1.15]">
          {greeting(now)}, {firstName}.
        </h1>
        <p className="max-w-[640px] text-gray-500">
          In deinen Kundenteams gibt es{" "}
          <b className="font-medium text-ink">{totalNew} neue Signale</b>, {oppsToReview}{" "}
          Opportunit{oppsToReview === 1 ? "y wartet" : "ies warten"} auf Prüfung,{" "}
          {overdue} Aufgabe{overdue === 1 ? " ist" : "n sind"} überfällig.
        </p>

        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-5">
          {customers.map((c) => {
            const newCount = c.signals.filter((s) => s.isNew).length;
            const top =
              c.signals.filter((s) => s.isNew).sort((a, b) => b.relevance - a.relevance)[0] ??
              c.signals[0];
            const spark = months.map(
              (m) =>
                c.signals.filter(
                  (s) =>
                    s.occurredAt >= m.start &&
                    s.occurredAt < new Date(m.start.getFullYear(), m.start.getMonth() + 1, 1)
                ).length
            );
            return (
              <Link
                key={c.id}
                href={`/kunden/${c.slug}`}
                className="rounded-card border border-gray-150 bg-paper p-[22px] transition-colors hover:border-ink"
              >
                <div className="mb-3.5 flex items-start justify-between">
                  <div>
                    <h3 className="text-[1.15rem]">{c.name}</h3>
                    <div className="text-[0.8rem] text-gray-500">
                      {c.industry}
                      {c.teamLabel ? ` · ${c.teamLabel}` : ""}
                    </div>
                  </div>
                  {newCount > 0 && (
                    <span className="whitespace-nowrap rounded-full bg-accent px-2.5 py-[3px] text-[0.72rem] font-medium text-ink">
                      {newCount} neu
                    </span>
                  )}
                </div>
                {top && (
                  <div className="my-3.5 border-l-2 border-accent pl-3 text-[0.9rem] leading-[1.45] text-gray-700">
                    {top.title}
                  </div>
                )}
                <Sparkline values={spark} muted={newCount === 0} />
                <div className="mt-3 flex gap-[18px] text-[0.78rem] text-gray-500">
                  <span>
                    <b className="block text-[1.05rem] font-medium text-ink">
                      {c.opportunities.length}
                    </b>
                    Opportunit{c.opportunities.length === 1 ? "y" : "ies"}
                  </span>
                  <span>
                    <b className="block text-[1.05rem] font-medium text-ink">{c.tasks.length}</b>
                    Aufgabe{c.tasks.length === 1 ? "" : "n"} offen
                  </span>
                  <span>
                    <b className="block text-[1.05rem] font-medium text-ink">
                      {c.projects.length}
                    </b>
                    Projekt{c.projects.length === 1 ? "" : "e"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
