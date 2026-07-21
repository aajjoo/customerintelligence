"use client";

import { signIn } from "next-auth/react";

export default function SignInButtons({ demoMode }: { demoMode: boolean }) {
  if (demoMode) {
    return (
      <>
        <button
          className="w-full rounded-el bg-ink px-5 py-3 text-[0.95rem] font-medium text-paper hover:bg-gray-900"
          onClick={() => signIn("demo", { callbackUrl: "/" })}
        >
          Demo-Anmeldung
        </button>
        <p className="mt-3 text-[0.78rem] leading-relaxed text-gray-500">
          Demo-Modus: GOOGLE_CLIENT_ID ist nicht konfiguriert. Mit hinterlegten
          Google-Zugangsdaten erscheint hier die Google-Anmeldung (nur erlaubte Domain).
        </p>
      </>
    );
  }
  return (
    <button
      className="w-full rounded-el bg-ink px-5 py-3 text-[0.95rem] font-medium text-paper hover:bg-gray-900"
      onClick={() => signIn("google", { callbackUrl: "/" })}
    >
      Mit Google anmelden
    </button>
  );
}
