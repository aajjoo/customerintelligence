import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { isAllowedEmail } from "@/lib/access";
import { db } from "@/lib/db";

// Auth laut CLAUDE.md: Google Sign-In (OAuth 2.0), nur Domain netural.com.
// Ohne GOOGLE_CLIENT_ID läuft der Demo-Modus (siehe README): Anmeldung als Seed-Lead,
// damit die App ohne OAuth-Setup begutachtet werden kann.

export const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const authOptions: NextAuthOptions = {
  providers: googleConfigured
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : [
        CredentialsProvider({
          id: "demo",
          name: "Demo",
          credentials: {},
          async authorize() {
            const user =
              (await db.user.findFirst({ where: { role: "lead" } })) ??
              (await db.user.findFirst());
            return user ? { id: user.id, email: user.email, name: user.name } : null;
          },
        }),
      ],
  session: { strategy: "jwt" },
  pages: { signIn: "/anmelden" },
  callbacks: {
    // Domain-Restriktion: außerhalb der erlaubten Domain keine Anmeldung
    signIn({ user, account }) {
      if (account?.provider === "google") {
        return isAllowedEmail(user.email, process.env.ALLOWED_EMAIL_DOMAIN);
      }
      return true;
    },
    // Rollenmodell: Rolle kommt aus der DB; unbekannte Nutzer der Domain werden
    // als Teammitglied angelegt (Rollen-Upgrade macht der Admin, Verwaltung folgt)
    async jwt({ token }) {
      if (token.email) {
        let user = await db.user.findUnique({ where: { email: token.email } });
        if (!user) {
          user = await db.user.create({
            data: {
              email: token.email,
              name: token.name ?? token.email.split("@")[0],
              role: "member",
            },
          });
        }
        token.userId = user.id;
        token.role = user.role;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as string) ?? "member";
      }
      return session;
    },
  },
};
