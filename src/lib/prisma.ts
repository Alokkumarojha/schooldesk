import 'server-only';

import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  schoolDeskPrisma?: PrismaClient;
};

// Lazy initialization keeps the demo frontend/build independent of credentials.
// Reuse the client across development hot reloads and server requests.
export function getPrisma(): PrismaClient {
  if (globalForPrisma.schoolDeskPrisma) return globalForPrisma.schoolDeskPrisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('Set DATABASE_URL in the project root .env before using Prisma.');
  }

  const adapter = new PrismaNeon({ connectionString });
  const client = new PrismaClient({ adapter });
  globalForPrisma.schoolDeskPrisma = client;
  return client;
}
