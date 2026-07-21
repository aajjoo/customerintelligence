"use client";

import Link from "next/link";
import { useState } from "react";
import type { CustomerDTO, TabKey } from "@/components/customer/types";
import RadarTab from "@/components/customer/RadarTab";
import ProjectsTab from "@/components/customer/ProjectsTab";
import ChatTab from "@/components/customer/ChatTab";
import TasksTab from "@/components/customer/TasksTab";
import ReportTab from "@/components/customer/ReportTab";
import { fmtReportMonth } from "@/lib/format";

// Kundenseite: Header + 5 Tabs laut design-spec.md.
// Tab-Zustand lebt im Client; alle Daten kommen serialisiert vom Server.

export default function CustomerView({ customer }: { customer: CustomerDTO }) {
  const [tab, setTab] = useState<TabKey>("radar");

  const newCount = customer.signals.filter((s) => s.isNew).length;
  const openTasks = customer.tasks.filter((t) => t.status === "open").length;
  const radarSince = new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(
    new Date(customer.radarSince)
  );
  const reportLabel = customer.report
    ? `Monatsbericht ${fmtReportMonth(customer.report.month).split(" ")[0]}`
    : "Monatsbericht";

  const tabs: { key: TabKey; label: string; badge?: string }[] = [
    { key: "radar", label: "Radar", badge: newCount > 0 ? `${newCount} neu` : undefined },
    { key: "projekte", label: "Projekte & KPIs", badge: String(customer.projects.length) },
    { key: "chat", label: "Chat" },
    { key: "aufgaben", label: "Aufgaben", badge: openTasks > 0 ? String(openTasks) : undefined },
    { key: "bericht", label: "Bericht" },
  ];

  return (
    <>
      <div className="mb-4 text-[0.85rem] text-gray-500">
        <Link href="/" className="hover:text-ink">
          Meine Kunden
        </Link>{" "}
        / {customer.name}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[2.1rem] leading-[1.15]">{customer.name}</h1>
          <p className="max-w-[640px] text-gray-500">
            {customer.industry}
            {customer.markets ? ` · ${customer.markets}` : ""}
            {customer.leadName ? ` · Account Lead: ${customer.leadName}` : ""} ·{" "}
            <span className="text-ink">Radar aktiv seit {radarSince}</span>
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            className="rounded-el border border-gray-300 px-5 py-2.5 text-[0.9rem] font-medium hover:bg-gray-75"
            onClick={() => setTab("bericht")}
          >
            {reportLabel}
          </button>
          <button
            className="rounded-el bg-ink px-5 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-gray-900"
            onClick={() => setTab("chat")}
          >
            Radar fragen
          </button>
        </div>
      </div>

      <div className="mb-8 mt-7 flex gap-1 overflow-x-auto border-b border-gray-150">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`-mb-px whitespace-nowrap border-b-2 px-[18px] py-3 text-[0.95rem] ${
              tab === t.key
                ? "border-ink font-medium text-ink"
                : "border-transparent font-normal text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.badge && (
              <span
                className={`ml-1.5 rounded-full px-[7px] py-px text-[0.72rem] ${
                  tab === t.key ? "bg-accent text-ink" : "bg-gray-75 text-gray-700"
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "radar" && <RadarTab customer={customer} onShowTab={setTab} />}
      {tab === "projekte" && <ProjectsTab customer={customer} />}
      {tab === "chat" && <ChatTab customer={customer} />}
      {tab === "aufgaben" && <TasksTab customer={customer} />}
      {tab === "bericht" && <ReportTab customer={customer} />}
    </>
  );
}
