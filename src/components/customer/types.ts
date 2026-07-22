// Serialisierbare DTOs für die Kundenseite: Server-Komponente lädt aus Prisma,
// Client-Komponenten (Tabs) erhalten nur diese Strukturen (Dates als ISO-Strings).

export type SignalDTO = {
  id: string;
  dimension: string;
  title: string;
  summary: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  relevance: number;
  isNew: boolean;
  isKpiSignal: boolean;
  review: string;
  occurredAt: string;
};

export type KpiDTO = {
  id: string;
  label: string;
  unit: string | null;
  target: number | null;
  threshold: number | null;
  direction: string;
  values: { label: string; value: number }[];
};

export type ProjectDTO = {
  id: string;
  name: string;
  description: string | null;
  phase: string | null;
  status: string;
  externalRef: string | null;
  kpis: KpiDTO[];
};

export type OpportunityDTO = {
  id: string;
  title: string;
  stage: string;
  ownerLabel: string | null;
  rationale: string | null;
  hubspotDealId: string | null;
  updatedAt: string;
};

export type WorkflowStepDTO = { step: string; status: "done" | "active" | "pending"; note?: string };

export type WorkflowDTO = {
  id: string;
  skillName: string;
  status: string;
  steps: WorkflowStepDTO[];
  taskTitle: string;
};

export type TaskDTO = {
  id: string;
  title: string;
  status: string;
  originLabel: string | null;
  dueAt: string | null;
  assigneeName: string | null;
  workflow: WorkflowDTO | null;
};

export type ReportDTO = {
  id: string;
  month: string;
  execSummary: string;
  status: string;
  /** Generierte Abschnitte (Etappe 5); null bei Alt-/Seed-Berichten ohne Body */
  sections: { title: string; text: string }[] | null;
  suggestedTasks: { title: string; dueInDays: number; reason: string }[] | null;
} | null;

export type ChatMessageDTO = {
  role: "user" | "assistant";
  content: string;
  sources: string[];
};

export type CustomerDTO = {
  id: string;
  name: string;
  slug: string;
  industry: string;
  markets: string | null;
  teamLabel: string | null;
  radarSince: string;
  leadName: string | null;
  competitors: string[];
  signals: SignalDTO[];
  projects: ProjectDTO[];
  opportunities: OpportunityDTO[];
  tasks: TaskDTO[];
  report: ReportDTO;
  chatHistory: ChatMessageDTO[];
  monthly: { label: string; total: number; hot: number }[];
  /** Etappe 7: welche Integrationen konfiguriert sind (steuert UI-Buttons) */
  integrations: { hubspot: boolean };
  now: string;
};

export type TabKey = "radar" | "projekte" | "chat" | "aufgaben" | "bericht";
