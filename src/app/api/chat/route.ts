import Anthropic from "@anthropic-ai/sdk";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { canSeeAllCustomers } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { buildChatPrompt, CHAT_SCHEMA, CHAT_SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { retrieveContext } from "@/lib/chat/retrieve";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
const HISTORY_TURNS = 6; // letzte Nutzer/Assistent-Paare als Gesprächskontext

// Chat (Etappe 6, Konzept 4.5): Antworten aus dem Radar-Material mit Quellen-Chips,
// Verlauf gespeichert je Kunde und User. Team-Rechteprüfung (Kernregel 3).

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ist nicht gesetzt – Chat nicht möglich" },
      { status: 503 }
    );
  }

  let customerId: string, question: string;
  try {
    ({ customerId, question } = await request.json());
    if (!customerId || !question?.trim()) throw new Error();
  } catch {
    return NextResponse.json({ error: "customerId und question erforderlich" }, { status: 400 });
  }

  if (!canSeeAllCustomers(session.user.role)) {
    const membership = await db.teamMembership.findFirst({
      where: { userId: session.user.id, customerId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Kunden" }, { status: 403 });
    }
  }

  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });

  const [chunks, history] = await Promise.all([
    retrieveContext(customerId, question),
    db.chatMessage.findMany({
      where: { customerId, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS * 2,
    }),
  ]);

  const messages: { role: "user" | "assistant"; content: string }[] = history
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  messages.push({ role: "user", content: buildChatPrompt(customer.name, chunks, question) });

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [{ type: "text", text: CHAT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: CHAT_SCHEMA } },
    messages,
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json({ error: "Anfrage wurde abgelehnt" }, { status: 422 });
  }
  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const parsed = JSON.parse(text) as { answer: string; sources: string[] };
  const sources = [...new Set(parsed.sources)];

  // Verlauf persistieren (Konzept 4.5: je Kunde und User gespeichert)
  await db.chatMessage.create({
    data: { customerId, userId: session.user.id, role: "user", content: question },
  });
  await db.chatMessage.create({
    data: {
      customerId,
      userId: session.user.id,
      role: "assistant",
      content: parsed.answer,
      sourcesJson: JSON.stringify(sources),
    },
  });

  return NextResponse.json({ answer: parsed.answer, sources });
}
