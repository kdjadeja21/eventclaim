import type { Config } from "drizzle-kit";

// drizzle-kit (migrations, introspection) needs a session-capable connection,
// so it uses DIRECT_URL (port 5432) rather than the transaction pooler that
// the app uses at runtime (DATABASE_URL, port 6543).
const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!directUrl) {
  throw new Error("Set DIRECT_URL (or DATABASE_URL) before running drizzle-kit.");
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: directUrl },
  strict: true,
  verbose: true,
} satisfies Config;
