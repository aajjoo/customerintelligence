import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { customerWhereForUser } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Benachrichtigungen (Feedback-Runde): die neuesten ungesichteten Signale
// im Sichtbarkeitsbereich des Users, für das Glocken-Dropdown der Topbar.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const signals = await db.signal.findMany({
    where: {
      isNew: true,
      customer: customerWhereForUser(session.user.id, session.user.role),
    },
    include: { customer: true },
    orderBy: { occurredAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    items: signals.map((s) => ({
      title: s.title,
      customer: s.customer.name,
      href: `/kunden/${s.customer.slug}`,
      relevance: s.relevance,
      occurredAt: s.occurredAt.toISOString().slice(0, 10),
    })),
  });
}
