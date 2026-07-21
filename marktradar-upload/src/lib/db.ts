import { PrismaClient } from "@prisma/client";

// Prisma-Singleton: verhindert Verbindungs-Leaks durch Hot-Reload in der Entwicklung.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
