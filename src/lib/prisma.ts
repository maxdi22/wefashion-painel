import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  console.error('[Prisma] CRITICAL: DATABASE_URL is not defined. Database operations will fail.');
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
