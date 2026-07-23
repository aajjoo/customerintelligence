"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AddCustomerModal from "@/components/AddCustomerModal";

// Topbar (Feedback-Runde): funktionale globale Suche (Kunden/Signale/Projekte),
// Benachrichtigungs-Dropdown mit neuen Signalen, "+ Kunde hinzufügen".

type SearchHit = { kind: string; title: string; sub: string; href: string };
type NotifItem = { title: string; customer: string; href: string; occurredAt: string };

const KIND_LABEL: Record<string, string> = {
  kunde: "Kunde",
  signal: "Signal",
  projekt: "Projekt",
};

export default function Topbar({ hasNew = false }: { hasNew?: boolean }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotifItem[] | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  // Suche mit Debounce
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setHits([]);
      setSearchOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suche?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setHits(data.hits ?? []);
          setSearchOpen(true);
        }
      } catch {
        // Suche still scheitern lassen
      }
    }, 250);
  }, [query]);

  async function openNotifs() {
    setNotifOpen(!notifOpen);
    setSearchOpen(false);
    if (!notifOpen && notifs === null) {
      try {
        const res = await fetch("/api/benachrichtigungen");
        if (res.ok) setNotifs((await res.json()).items ?? []);
      } catch {
        setNotifs([]);
      }
    }
  }

  function go(href: string) {
    setSearchOpen(false);
    setNotifOpen(false);
    setQuery("");
    router.push(href);
    router.refresh();
  }

  return (
    <>
      <div className="relative mb-9 flex items-center gap-4 border-b border-gray-150 py-6">
        <div className="relative max-w-[420px] flex-1">
          <input
            className="w-full rounded-el bg-gray-75 px-3.5 py-2.5 text-[0.9rem] outline-none placeholder:text-gray-500 focus:ring-1 focus:ring-ink"
            placeholder="🔍  Kunden, Signale, Projekte durchsuchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => hits.length > 0 && setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false);
              if (e.key === "Enter" && hits[0]) go(hits[0].href);
            }}
          />
          {searchOpen && hits.length > 0 && (
            <div className="absolute left-0 top-12 z-30 w-full rounded-card border border-gray-150 bg-paper py-2 shadow-lg">
              {hits.map((h, i) => (
                <button
                  key={i}
                  className="flex w-full items-baseline gap-2.5 px-4 py-2 text-left hover:bg-gray-75"
                  onClick={() => go(h.href)}
                >
                  <span className="w-14 flex-shrink-0 text-[0.68rem] font-medium uppercase tracking-wide text-gray-500">
                    {KIND_LABEL[h.kind] ?? h.kind}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9rem]">{h.title}</span>
                    <span className="block truncate text-[0.75rem] text-gray-500">{h.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {searchOpen && query.trim().length >= 2 && hits.length === 0 && (
            <div className="absolute left-0 top-12 z-30 w-full rounded-card border border-gray-150 bg-paper px-4 py-3 text-[0.85rem] text-gray-500 shadow-lg">
              Keine Treffer für „{query}“
            </div>
          )}
        </div>

        <div className="relative">
          <button
            className="relative flex h-[38px] w-[38px] items-center justify-center rounded-el text-[1.05rem] hover:bg-gray-75"
            title="Benachrichtigungen"
            onClick={openNotifs}
          >
            🔔
            {hasNew && (
              <span className="absolute right-[7px] top-[7px] h-2 w-2 rounded-full bg-accent" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 z-30 w-[360px] rounded-card border border-gray-150 bg-paper py-2 shadow-lg">
              <div className="px-4 py-1.5 text-[0.72rem] font-medium uppercase tracking-wide text-gray-500">
                Neue Signale
              </div>
              {notifs === null && (
                <div className="px-4 py-2 text-[0.85rem] text-gray-500">Lade …</div>
              )}
              {notifs?.length === 0 && (
                <div className="px-4 py-2 text-[0.85rem] text-gray-500">
                  Nichts Neues – alles gesichtet.
                </div>
              )}
              {notifs?.map((n, i) => (
                <button
                  key={i}
                  className="block w-full px-4 py-2 text-left hover:bg-gray-75"
                  onClick={() => go(n.href)}
                >
                  <span className="block truncate text-[0.88rem]">{n.title}</span>
                  <span className="block text-[0.74rem] text-gray-500">
                    {n.customer} · {n.occurredAt}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="rounded-el bg-ink px-5 py-2.5 text-[0.9rem] font-medium text-paper hover:bg-gray-900"
          onClick={() => setModalOpen(true)}
        >
          + Kunde hinzufügen
        </button>
      </div>
      {modalOpen && <AddCustomerModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
