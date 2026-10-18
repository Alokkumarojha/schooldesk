import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "jiti prisma/seed.ts",
  },
  datasource: {
    // Direct Neon connection for future CLI operations. Generation needs no URL.
    url: process.env.DIRECT_URL || undefined,
  },
});
