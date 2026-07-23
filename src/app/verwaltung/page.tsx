import { getServerSession } from "next-auth";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import AdminPanel from "@/components/admin/AdminPanel";
import { canSeeAllCustomers, customerWhereForUser } from "@/lib/access";
import { getAreaInstruction } from "@/lib/areaSkills";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Verwaltung (Feedback-Runde): Kunden (Frequenz, Quellen, Löschen), Benutzer-Rollen,
// Netural-Leistungsportfolio. Leads verwalten ihre Kunden; Rollen nur Management/Admin.

export default async function VerwaltungPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user;
  const isAdmin = canSeeAllCustomers(user.role);

  const [customers, users, totalNew, portfolio] = await Promise.all([
    db.customer.findMany({
      where: customerWhereForUser(user.id, user.role),
      orderBy: { name: "asc" },
      include: {
        sources: { orderBy: { label: "asc" } },
        memberships: { include: { user: true }, orderBy: { user: { name: "asc" } } },
        _count: { select: { signals: true } },
      },
    }),
    // Benutzerliste auch für Leads: nötig für die Team-Zuweisung je Kunde
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.signal.count({ where: { isNew: true, customer: customerWhereForUser(user.id, user.role) } }),
    getAreaInstruction("leistungsportfolio"),
  ]);

  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <Sidebar
        active="/verwaltung"
        newCount={totalNew}
        userName={user.name ?? undefined}
        userRole={ROLE_LABELS[user.role] ?? user.role}
      />
      <main className="w-full max-w-[1240px] px-5 pb-28 md:px-12 md:pb-20">
        <Topbar hasNew={totalNew > 0} />
        <div className="mb-2 text-[0.78rem] font-medium uppercase tracking-[0.09em] text-gray-500">
          Verwaltung
        </div>
        <h1 className="mb-1.5 text-[2.1rem] leading-[1.15]">Verwaltung</h1>
        <p className="max-w-[640px] text-gray-500">
          Kunden, Quellen und Recherche-Frequenz verwalten
          {isAdmin ? ", Benutzerrollen und Leistungsportfolio pflegen" : ""}.
        </p>

        <AdminPanel
          isAdmin={isAdmin}
          portfolio={portfolio ?? ""}
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            industry: c.industry,
            researchFrequency: c.researchFrequency,
            leadName: c.memberships.find((m) => m.isLead)?.user.name ?? null,
            signalCount: c._count.signals,
            team: c.memberships.map((m) => ({
              id: m.id,
              userId: m.userId,
              name: m.user.name,
              isLead: m.isLead,
            })),
            sources: c.sources.map((s) => ({
              id: s.id,
              kind: s.kind,
              label: s.label,
              url: s.url,
              active: s.active,
              lastFetchedAt: s.lastFetchedAt?.toISOString() ?? null,
              lastError: s.lastError,
            })),
          }))}
          users={users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            isSelf: u.id === user.id,
          }))}
        />
      </main>
    </div>
  );
}
