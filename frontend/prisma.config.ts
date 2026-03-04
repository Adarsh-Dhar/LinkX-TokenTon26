import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  env: ".env",
  datasourceUrl: process.env.DATABASE_URL ?? "file:./dev.db",
});
