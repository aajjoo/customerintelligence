import Link from "next/link";
import { notFound } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type SignalRow = {
  id: string;
  isNew: boolean;
  relevance: number;
  isKpiSignal: boolean;
  dimension: string;
  occurredAt: Date;
  title: string;
  summary: string;
  sourceLabel: string | null;
};

const DIM_LABELS: Record<string, string> = {
  markt: "Markt & Branche",
  kunde: "Kunde direkt",
  mitbewerb: "Mitbewerb",
  innovation: "Innovation",
  geschaeft: "Geschäftsebene",
  politik: "Politik & Regulatorik",
  intern: "Internes Lagebild",
};

export default async function CustomerPage({ params }: { params: { slug: string } }) {
  const customer = await db.customer.findUnique({
    where: { slug: params.slug },
    include: {
      signals: { orderBy: [{ occurredAt: "desc" }] },
      projects: { include: { kpis: { include: { values: { orderBy: { period: "asc" } } } } } },
      opportunities: true,
      tasks: { where: { status: "open" } },
    },
  });
  if (!customer) notFound();

  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <Sidebar active="/" />
      <main className="w-full max-w-[1240px] px-6 pb-20 md:px-12">
        <Topbar />
        <div className="mb-4 text-sm text-gray-500">
          <Link href="/" className="hover:text-ink">
            Meine Kunden
          </Link>{" "}
          / {customer.name}
        </div>
        <h1 className="text-[2.1rem] leading-tight">{customer.name}</h1>
        <p className="text-gray-500">
          {customer.industry} · {customer.markets} ·{" "}
          {customer.projects.length} Projekte · {customer.opportunities.length} Opportunities ·{" "}
          {customer.tasks.length} offene Aufgaben
        </p>

        {/* Etappe 2 baut hier die Tabs Radar / Projekte & KPIs / Chat / Aufgaben / Bericht */}
        <h2 className="mb-4 mt-10 text-lg">Radar</h2>
        <div className="flex max-w-3xl flex-col gap-3.5">
          {customer.signals.map((s: SignalRow) => (
            <div
              key={s.id}
              className="rounded-card border border-gray-150 p-5 transition-colors hover:border-ink"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2.5">
                {s.isNew && (
                  <span className="rounded bg-accent px-2 py-0.5 text-[0.72rem] font-medium uppercase tracking-wide text-ink">
                    Neu
                  </span>
                )}
                {s.relevance >= 80 && (
                  <span className="rounded bg-ink px-2 py-0.5 text-[0.72rem] font-medium uppercase tracking-wide text-paper">
                    Hohe Relevanz
                  </span>
                )}
                {s.isKpiSignal && (
                  <span className="rounded bg-accent-soft px-2 py-0.5 text-[0.72rem] font-medium uppercase tracking-wide text-gray-900">
                    KPI-Signal
                  </span>
                )}
                <span className="rounded bg-gray-75 px-2 py-0.5 text-[0.72rem] font-medium uppercase tracking-wide text-gray-700">
                  {DIM_LABELS[s.dimension] ?? s.dimension}
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  {new Intl.DateTimeFormat("de-AT", { day: "numeric", month: "long" }).format(
                    s.occurredAt
                  )}
                </span>
              </div>
              <h4 className="mb-1.5 font-medium">{s.title}</h4>
              <p className="text-sm leading-relaxed text-gray-700">{s.summary}</p>
              {s.sourceLabel && (
                <div className="mt-2.5 text-xs text-gray-500">Quelle: {s.sourceLabel}</div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
