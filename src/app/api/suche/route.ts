import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { customerWhereForUser } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Globale Suche (Feedback-Runde): Kunden, Signale und Projekte im Sichtbarkeitsbereich
// des Users (Kernregel 3). Liefert Treffer mit Sprungzielen für die Topbar.

export type SearchHit = { kind: "kunde" | "signal" | "projekt"; title: string; sub: string; href: string };

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const accessWhere = customerWhereForUser(session.user.id, session.user.role);

  const [customers, signals, projects] = await Promise.all([
    db.customer.findMany({
      where: {
        ...accessWhere,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { industry: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
    }),
    db.signal.findMany({
      where: {
        customer: accessWhere,
        review: { not: "irrelevant" },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { summary: { contains: q, mode: "insensitive" } },
        ],
      },
      include: { customer: true },
      orderBy: { occurredAt: "desc" },
      take: 6,
    }),
    db.project.findMany({
      where: { customer: accessWhere, name: { contains: q, mode: "insensitive" } },
      include: { customer: true },
      take: 4,
    }),
  ]);

  const hits: SearchHit[] = [
    ...customers.map((c) => ({
      kind: "kunde" as const,
      title: c.name,
      sub: c.industry,
      href: `/kunden/${c.slug}`,
    })),
    ...signals.map((s) => ({
      kind: "signal" as const,
      title: s.title,
      sub: `${s.customer.name} · ${s.sourceLabel ?? "Radar"}`,
      href: `/kunden/${s.customer.slug}`,
    })),
    ...projects.map((p) => ({
      kind: "projekt" as const,
      title: p.name,
      sub: p.customer.name,
      href: `/kunden/${p.customer.slug}`,
    })),
  ];

  return NextResponse.json({ hits });
}
