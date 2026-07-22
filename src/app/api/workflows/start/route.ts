import Anthropic from "@anthropic-ai/sdk";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { canSeeAllCustomers } from "@/lib/access";
import { authOptions } from "@/lib/auth";
import { retrieveContext } from "@/lib/chat/retrieve";
import { db } from "@/lib/db";
import {
  buildWorkflowPrompt,
  initialSteps,
  stepsAfterDraft,
  WORKFLOW_SCHEMA,
  WORKFLOW_SYSTEM_PROMPT,
} from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";

// Workflow starten (Etappe 8): sammelt Radar-Material, erzeugt mit Claude einen
// Entwurf und stellt ihn zur Freigabe (Kernregel 2: nichts Externes ohne Freigabe).

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ist nicht gesetzt – Workflows nicht möglich" },
      { status: 503 }
    );
  }

  let taskId: string, skillId: string;
  try {
    ({ taskId, skillId } = await request.json());
    if (!taskId || !skillId) throw new Error();
  } catch {
    return NextResponse.json({ error: "taskId und skillId erforderlich" }, { status: 400 });
  }

  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { customer: true, workflowRun: true },
  });
  if (!canSeeAllCustomers(session.user.role)) {
    const membership = await db.teamMembership.findFirst({
      where: { userId: session.user.id, customerId: task.customerId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Kein Zugriff auf diesen Kunden" }, { status: 403 });
    }
  }
  if (task.workflowRun && !["failed"].includes(task.workflowRun.status)) {
    return NextResponse.json({ error: "Für diese Aufgabe läuft bereits ein Workflow" }, { status: 409 });
  }

  const skill = await db.skill.findUniqueOrThrow({ where: { id: skillId } });

  // Lauf anlegen (Protokoll ab Schritt 1)
  const run = await db.workflowRun.upsert({
    where: { taskId },
    create: { taskId, skillName: skill.name, stepsJson: JSON.stringify(initialSteps()) },
    update: {
      skillName: skill.name,
      status: "running",
      draft: null,
      approvalAt: null,
      stepsJson: JSON.stringify(initialSteps()),
    },
  });

  try {
    const chunks = await retrieveContext(task.customerId, `${skill.name} ${task.title}`);
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [
        { type: "text", text: WORKFLOW_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: WORKFLOW_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: buildWorkflowPrompt(skill, task.customer.name, task.title, chunks),
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("Generierung abgelehnt (refusal)");
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const { draft } = JSON.parse(text) as { draft: string };

    await db.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "waiting_approval",
        draft,
        stepsJson: JSON.stringify(stepsAfterDraft(chunks.length, draft.length)),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await db.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        stepsJson: JSON.stringify([
          { step: "Signale & Quellen sammeln", status: "done" },
          {
            step: "Entwurf erstellen",
            status: "active",
            note: e instanceof Error ? e.message : "fehlgeschlagen",
          },
        ]),
      },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Workflow fehlgeschlagen" },
      { status: 502 }
    );
  }
}
