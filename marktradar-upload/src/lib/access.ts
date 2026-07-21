// Rechteprüfung als reine Funktionen (getestet in tests/access.test.ts, ohne DB/Framework):
// Sichtbarkeit strikt pro Kundenteam (Kernregel 3):
// Management/Admin sehen alles, alle anderen nur zugeordnete Kunden.

/** Domain-Restriktion für den Google-Login (CLAUDE.md: nur netural.com). */
export function isAllowedEmail(
  email: string | null | undefined,
  domain: string | null | undefined
): boolean {
  if (!email) return false;
  if (!domain) return true; // keine Restriktion konfiguriert
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}

export function canSeeAllCustomers(role: string): boolean {
  return role === "management" || role === "admin";
}

/** Prisma-Where-Fragment für alle Customer-Queries. */
export function customerWhereForUser(userId: string, role: string): object {
  if (canSeeAllCustomers(role)) return {};
  return { memberships: { some: { userId } } };
}
