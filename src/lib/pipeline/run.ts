// Orchestrator Pipeline v1 (Etappe 3): Erfassung → Dedupe → Claude-Scoring →
// Review-Queue. Jeder Lauf wird als PipelineRun protokolliert.
// Kernregel 1: jedes erzeugte Signal trägt eine Quellenangabe.
import { db } from "@/lib/db";
import { formatRunSummary, postToSlack, slackConfigured } from "@/lib/integrations/slack";
import { generateReport } from "@/lib/report/generate";
import { dedupe } from "./dedupe";
import { checkKpi, kpiSignalHash } from "./kpi";
import { fetchFeed } from "./rss";
import { checkTask } from "./taskcheck";
import { crawlWebsite } from "./website";
import { claudeScorer, type Scorer } from "./scoring";
import type { CustomerProfile, CustomerRunStats, RawItem } from "./types";

/** Obergrenze neuer Items pro Quelle und Lauf (Kosten-/Laufzeitkontrolle, wird geloggt). */
const MAX_ITEMS_PER_SOURCE = 20;
/** Signale unterhalb dieser Relevanz werden nicht ausgespielt (Rauschen). */
const MIN_RELEVANCE = 30;

export async function runPipeline(options?: {
  customerId?: string;
  trigger?: "cron" | "manual";
  scorer?: Scorer; // injizierbar für Tests
}): Promise<{ runId: string; stats: CustomerRunStats[] }> {
  const scorer = options?.scorer ?? claudeScorer;
  const run = await db.pipelineRun.create({
    data: { trigger: options?.trigger ?? "manual" },
  });

  const customers = await db.customer.findMany({
    where: options?.customerId ? { id: options.customerId } : {},
    include: {
      sources: { where: { active: true } },
      projects: { include: { kpis: { include: { values: { orderBy: { period: "desc" }, take: 1 } } } } },
      tasks: { where: { status: "open" }, include: { assignee: true } },
    },
  });

  const allStats: CustomerRunStats[] = [];
  try {
    for (const customer of customers) {
      const stats: CustomerRunStats = {
        customer: customer.name,
        fetched: 0,
        fresh: 0,
        created: 0,
        discarded: 0,
        kpiSignals: 0,
        taskSignals: 0,
        errors: [],
      };
      allStats.push(stats);

      let profile: CustomerProfile = {
        name: customer.name,
        industry: customer.industry,
        markets: customer.markets,
        competitors: [],
        themes: [],
      };
      try {
        const p = JSON.parse(customer.profileJson ?? "{}");
        profile = { ...profile, competitors: p.competitors ?? [], themes: p.themes ?? [] };
      } catch {
        // Ohne Profil wird nur gegen Branche/Märkte bewertet
      }

      // ---- Erfassung je Quelle ----
      const collected: { item: RawItem; sourceId: string; sourceLabel: string }[] = [];
      for (const source of customer.sources) {
        if (!source.url) continue;
        try {
          if (source.kind === "news") {
            const items = await fetchFeed(source.url);
            stats.fetched += items.length;
            if (items.length > MAX_ITEMS_PER_SOURCE) {
              stats.errors.push(
                `${source.label}: ${items.length - MAX_ITEMS_PER_SOURCE} Items über Limit verworfen`
              );
            }
            for (const item of items.slice(0, MAX_ITEMS_PER_SOURCE)) {
              collected.push({ item, sourceId: source.id, sourceLabel: source.label });
            }
          } else if (source.kind === "website") {
            const result = await crawlWebsite(source.url);
            const state = JSON.parse(source.stateJson ?? "{}");
            if (state.contentHash !== result.contentHash) {
              stats.fetched += result.items.length;
              for (const item of result.items.slice(0, MAX_ITEMS_PER_SOURCE)) {
                collected.push({ item, sourceId: source.id, sourceLabel: source.label });
              }
              await db.source.update({
                where: { id: source.id },
                data: { stateJson: JSON.stringify({ contentHash: result.contentHash }) },
              });
            }
          } else {
            continue; // andere Quellenarten folgen in Etappe 7
          }
          await db.source.update({
            where: { id: source.id },
            data: { lastFetchedAt: new Date() },
          });
        } catch (e) {
          stats.errors.push(`${source.label}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // ---- Dedupe gegen bestehende Signale des Kunden ----
      const existing = await db.signal.findMany({
        where: { customerId: customer.id, contentHash: { not: null } },
        select: { contentHash: true },
      });
      const known = new Set(existing.map((s) => s.contentHash as string));
      // Meta (Quelle, Hash) über den Item-Index verknüpft – Scoring erhält reine RawItems
      const fresh = dedupe(collected.map((c) => c.item), known).map((f) => {
        const meta = collected.find((c) => c.item === f.item)!;
        return { item: f.item, hash: f.hash, sourceId: meta.sourceId, sourceLabel: meta.sourceLabel };
      });
      stats.fresh = fresh.length;

      // ---- Claude-Scoring + Signal-Erzeugung ----
      if (fresh.length > 0) {
        try {
          const scored = await scorer(
            profile,
            fresh.map((f) => f.item)
          );
          for (const s of scored) {
            // ScoredItem behält die Original-Referenzfelder (title/url) des RawItems
            const match = fresh.find((f) => f.item.title === s.title && f.item.url === s.url);
            if (!match) continue;
            // Unter der Relevanzschwelle: als aussortiert speichern (UI blendet
            // review=irrelevant aus) – verhindert erneutes Scoring im nächsten Lauf
            const belowThreshold = s.relevance < MIN_RELEVANCE;
            await db.signal.create({
              data: {
                customerId: customer.id,
                sourceId: match.sourceId,
                dimension: s.dimension,
                title: s.titleDe,
                summary: s.summaryDe,
                sourceLabel: match.sourceLabel, // Kernregel 1: immer mit Quelle
                sourceUrl: s.url,
                relevance: s.relevance,
                contentHash: match.hash,
                occurredAt: s.publishedAt ?? new Date(),
                ...(belowThreshold ? { review: "irrelevant", isNew: false } : {}),
              },
            });
            if (belowThreshold) stats.discarded++;
            else stats.created++;
          }
        } catch (e) {
          stats.errors.push(`Scoring: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // ---- Kernregel 5: KPI-Schwellen prüfen ----
      for (const project of customer.projects) {
        for (const kpi of project.kpis) {
          const latest = kpi.values[0];
          const draft = checkKpi({
            kpiId: kpi.id,
            label: kpi.label,
            unit: kpi.unit,
            target: kpi.target,
            threshold: kpi.threshold,
            direction: kpi.direction,
            latestValue: latest?.value ?? null,
            projectName: project.name,
          });
          if (!draft || !latest) continue;
          const hash = kpiSignalHash(kpi.id, latest.period);
          const exists = await db.signal.findFirst({
            where: { customerId: customer.id, contentHash: hash },
          });
          if (exists) continue;
          await db.signal.create({
            data: {
              customerId: customer.id,
              dimension: "intern",
              title: draft.title,
              summary: draft.summary,
              sourceLabel: draft.sourceLabel,
              relevance: 85,
              isKpiSignal: true,
              contentHash: hash,
            },
          });
          stats.kpiSignals++;
        }
      }

      // ---- Etappe 5: Erinnerung/Eskalation überfälliger Aufgaben ----
      const now = new Date();
      for (const task of customer.tasks) {
        const draft = checkTask(
          {
            taskId: task.id,
            title: task.title,
            status: task.status,
            dueAt: task.dueAt,
            assigneeName: task.assignee?.name ?? null,
          },
          now
        );
        if (!draft) continue;
        const exists = await db.signal.findFirst({
          where: { customerId: customer.id, contentHash: draft.contentHash },
        });
        if (exists) continue;
        await db.signal.create({
          data: {
            customerId: customer.id,
            dimension: "intern",
            title: draft.title,
            summary: draft.summary,
            sourceLabel: draft.sourceLabel, // Quellenbezug: die Aufgabe selbst
            relevance: draft.relevance,
            contentHash: draft.contentHash,
          },
        });
        stats.taskSignals++;
      }

      // ---- Etappe 5: Monatsbericht am Monatsersten automatisch erzeugen (Konzept 4.2) ----
      if (options?.trigger === "cron" && now.getDate() === 1) {
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const hasReport = await db.report.findUnique({
          where: { customerId_month: { customerId: customer.id, month } },
        });
        if (!hasReport) {
          try {
            await generateReport(customer.id, month);
            stats.reportGenerated = true;
          } catch (e) {
            stats.errors.push(`Bericht: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }

    await db.pipelineRun.update({
      where: { id: run.id },
      data: { status: "done", finishedAt: new Date(), statsJson: JSON.stringify(allStats) },
    });

    // Etappe 7: Lauf-Zusammenfassung nach Slack (System-Notification, nur Cron)
    if (options?.trigger === "cron" && slackConfigured()) {
      try {
        const summary = formatRunSummary(allStats);
        if (summary) await postToSlack(summary);
      } catch {
        // Slack-Ausfall darf den Lauf nicht scheitern lassen
      }
    }
  } catch (e) {
    await db.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: e instanceof Error ? e.message : String(e),
        statsJson: JSON.stringify(allStats),
      },
    });
    throw e;
  }

  return { runId: run.id, stats: allStats };
}
