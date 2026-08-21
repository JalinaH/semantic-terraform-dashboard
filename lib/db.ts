import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: databaseUrlWithConnectionTimeout(process.env.DATABASE_URL),
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export function databaseUrlWithConnectionTimeout(value: string | undefined, timeoutSeconds = 15) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", String(timeoutSeconds));
    }
    return url.toString();
  } catch {
    return value;
  }
}
