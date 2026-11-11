import { defineConfig } from "drizzle-kit";

// Migrations are hand-written SQL in db/migrations (M-01); drizzle-kit only checks that the schema matches.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./db/migrations",
});
