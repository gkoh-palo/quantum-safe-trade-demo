// drizzle-kit config. `generate` works offline from the schema; `migrate` needs
// NEON_DATABASE_URL (supplied by the deploy.yml migrate job). /neon-db skill.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.NEON_DATABASE_URL ?? "" },
});
