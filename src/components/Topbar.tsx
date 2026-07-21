"use client";

import { useState } from "react";
import AddCustomerModal from "@/components/AddCustomerModal";

export default function Topbar({ hasNew = false }: { hasNew?: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="mb-9 flex items-center gap-4 border-b border-gray-150 py-6">
        <div className="flex max-w-[420px] flex-1 items-center gap-2 rounded-el bg-gray-75 px-3.5 py-2.5 text-[0.9rem] text-gray-500">
          🔍&nbsp; Kunden, Signale, Projekte durchsuchen …
        </div>
        <button
          className="relative flex h-[38px] w-[38px] items-center justify-center rounded-el text-[1.05rem] hover:bg-gray-75"
          title="Benachrichtigungen"
        >
          🔔
          {hasNew && (
            <span className="absolute right-[7px] top-[7px] h-2 w-2 rounded-full bg-accent" />
          )}
        </button>
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
