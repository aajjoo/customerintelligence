"use client";

import { signOut } from "next-auth/react";

export default function SignOutLink() {
  return (
    <button
      className="mt-2 text-[0.78rem] text-gray-500 hover:text-ink"
      onClick={() => signOut({ callbackUrl: "/anmelden" })}
    >
      Abmelden
    </button>
  );
}
