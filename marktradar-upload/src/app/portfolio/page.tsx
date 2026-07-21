import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ChartCanvas from "@/components/ChartCanvas";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Screen 3 "Portfolio" (Management-Sicht): Balken-Chart je Kunde,
// "Braucht Aufmerksamkeit"-Panel (regelbasiert) und Portfolio-Kennzahlen.
// Rollenbasierte Sichtbarkeit (Kernregel 3) greift mit dem Google-Login.

export default async function PortfolioPage() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const customers = await db.customer.findMany({
    orderBy: { name: "asc" },
    include: {
      signals: true,
      opportunities: true,
      tasks: { where: { status: "open" } },
      projects: { include: { kpis: { include: { values: { orderBy: { period: "asc" } } } } } },
      reports: { where: { month: currentMonth } },
    },
  });

  const totalNew = customers.reduce((n, c) => n + c.signals.filter((s) => s.isNew).length, 0);

  const rows = customers.map((c) => ({
    name: c.name,
    signals30: c.signals.filter((s) => s.occurredAt >= thirtyDaysAgo).length,
    openOpps: c.opportunities.filter((o) => !["won", "dropped"].includes(o.stage)).length,
  }));

  // "Braucht Aufmerksamkeit": KPI unter Schwelle, überfällige Aufgaben, fehlendes Radar-Profil
  const attention: string[] = [];
  for (const c of customers) {
    const kpiBelow = c.projects.some((p) =>
      p.kpis.some((k) => {
        const latest = k.values[k.values.length - 1];
        if (!latest || k.threshold == null) return false;
        return k.direction === "down" ? latest.value > k.threshold : latest.value < k.threshold;
      })
    );
    if (kpiBelow) attention.push(`${c.name} · KPI unter Schwelle`);
    const overdue = c.tasks.filter((t) => t.dueAt && t.dueAt < now).length;
    if (overdue > 0)
      attention.push(`${c.name} · ${overdue} Aufgabe${overdue === 1 ? "" : "n"} überfällig`);
    if (!c.profileJson) attention.push(`${c.name} · Radar-Profil unvollständig`);
  }

  const totalOpps = rows.reduce((n, r) => n + r.openOpps, 0);
  const projects = customers.flatMap((c) => c.projects);
  const projectsOk = projects.filter((p) => p.status === "ok").length;
  const reportsTotal = customers.length;
  const reportsApproved = customers.filter((r) => r.reports[0]?.status === "approved").length;
  const monthLabel = new Intl.DateTimeFormat("de-AT", { month: "long" }).format(now);

  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <Sidebar active="/portfolio" newCount={totalNew} />
      <main className="w-full max-w-[1240px] px-5 pb-28 md:px-12 md:pb-20">
        <Topbar hasNew={totalNew > 0} />

        <div className="mb-2 text-[0.78rem] font-medium uppercase tracking-[0.09em] text-gray-500">
          Management-Sicht
        </div>
        <h1 className="mb-1.5 text-[2.1rem] leading-[1.15]">Portfolio</h1>
        <p className="max-w-[640px] text-gray-500">
          Alle Kunden im Vergleich: Marktaktivität, Opportunities, Projektgesundheit und
          Aufgabenstand.
        </p>

        <div className="mt-8 grid items-start gap-9 lg:grid-cols-[1fr_320px]">
          <div className="rounded-card border border-gray-150 p-5">
            <h4 className="mb-3.5 text-[0.95rem]">Signale & Opportunities je Kunde, 30 Tage</h4>
            <div className="h-[280px]">
              <ChartCanvas
                config={{
                  type: "bar",
                  data: {
                    labels: rows.map((r) => r.name),
                    datasets: [
                      {
                        label: "Signale",
                        data: rows.map((r) => r.signals30),
                        backgroundColor: "#0A0A0A",
                        borderRadius: 4,
                      },
                      {
                        label: "Opportunities",
                        data: rows.map((r) => r.openOpps),
                        backgroundColor: "#F1BB1E",
                        borderRadius: 4,
                      },
                    ],
                  },
                  options: {
                    indexAxis: "y" as const,
                    plugins: { legend: { position: "bottom" as const, labels: { boxWidth: 10 } } },
                    scales: {
                      x: { grid: { color: "#F4F4F1" } },
                      y: { grid: { display: false } },
                    },
                  },
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-card border border-gray-150 p-5">
              <h4 className="mb-3.5 text-[0.95rem]">Braucht Aufmerksamkeit</h4>
              {attention.map((a) => (
                <div
                  key={a}
                  className="flex justify-between border-b border-gray-75 py-[7px] text-[0.88rem] text-gray-700 last:border-none"
                >
                  <span>{a}</span>
                  <b className="font-medium text-ink">⚑</b>
                </div>
              ))}
              {attention.length === 0 && (
                <p className="py-1 text-[0.88rem] text-gray-500">Alles im Rahmen.</p>
              )}
            </div>
            <div className="rounded-card border border-gray-150 p-5">
              <h4 className="mb-3.5 text-[0.95rem]">Portfolio gesamt</h4>
              <Row label="Aktive Kunden" value={String(customers.length)} />
              <Row label="Offene Opportunities" value={String(totalOpps)} />
              <Row label="Projekte auf Kurs" value={`${projectsOk} / ${projects.length}`} />
              <Row
                label={`Berichte freigegeben (${monthLabel})`}
                value={`${reportsApproved} / ${reportsTotal}`}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-75 py-[7px] text-[0.88rem] text-gray-700 last:border-none">
      <span>{label}</span>
      <b className="font-medium text-ink">{value}</b>
    </div>
  );
}
