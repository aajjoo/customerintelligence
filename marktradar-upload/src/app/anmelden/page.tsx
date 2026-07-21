import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions, googleConfigured } from "@/lib/auth";
import SignInButtons from "@/components/SignInButtons";

export const dynamic = "force-dynamic";

// Anmeldeseite: Google Sign-In mit Domain-Restriktion; ohne OAuth-Konfiguration Demo-Modus.

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/");

  const domain = process.env.ALLOWED_EMAIL_DOMAIN;

  return (
    <div className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-[420px] rounded-card border border-gray-150 p-9">
        <div className="mb-1 text-[1.35rem] font-semibold tracking-tight">
          Netural <span className="font-light text-gray-500">Marktradar</span>
        </div>
        <p className="mb-7 text-[0.9rem] leading-relaxed text-gray-500">
          Interne Plattform für Netural-Kundenteams.
          {domain ? ` Anmeldung nur mit @${domain}-Konto.` : ""}
        </p>
        <SignInButtons demoMode={!googleConfigured} />
      </div>
    </div>
  );
}
