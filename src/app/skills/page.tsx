import { getServerSession } from "next-auth";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import SkillsPanel from "@/components/admin/SkillsPanel";
import { customerWhereForUser } from "@/lib/access";
import { AREAS } from "@/lib/areaSkills";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Skills (Feedback-Runde): je Funktionsbereich editierbare Analyse-Anweisungen,
// die auf die AI-Analyse einwirken, plus Verwaltung der Workflow-Skills.

export default async function SkillsPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const [areaSkills, workflowSkills, totalNew] = await Promise.all([
    db.skill.findMany({ where: { scope: "area" } }),
    db.skill.findMany({ where: { scope: "org" }, orderBy: { name: "asc" } }),
    db.signal.count({ where: { isNew: true, customer: customerWhereForUser(user.id, user.role) } }),
  ]);

  const areas = AREAS.filter((a) => a.key !== "leistungsportfolio").map((a) => ({
    ...a,
    instruction: areaSkills.find((s) => s.name === a.key && s.active)?.promptTmpl ?? "",
  }));

  return (
    <div className="grid min-h-screen md:grid-cols-[232px_1fr]">
      <Sidebar
        active="/skills"
        newCount={totalNew}
        userName={user.name ?? undefined}
        userRole={ROLE_LABELS[user.role] ?? user.role}
      />
      <main className="w-full max-w-[1240px] px-5 pb-28 md:px-12 md:pb-20">
        <Topbar hasNew={totalNew > 0} />
        <div className="mb-2 text-[0.78rem] font-medium uppercase tracking-[0.09em] text-gray-500">
          Skills
        </div>
        <h1 className="mb-1.5 text-[2.1rem] leading-[1.15]">Skills</h1>
        <p className="max-w-[640px] text-gray-500">
          Analyse-Anweisungen je Bereich steuern, wie Claude bewertet, berichtet und antwortet –
          Änderungen wirken sofort, ohne Deployment. Darunter die Workflow-Skills für Aufgaben.
        </p>

        <SkillsPanel
          areas={areas}
          workflowSkills={workflowSkills.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description ?? "",
            promptTmpl: s.promptTmpl ?? "",
            outputKind: s.outputKind ?? "briefing",
            active: s.active,
          }))}
        />
      </main>
    </div>
  );
}
