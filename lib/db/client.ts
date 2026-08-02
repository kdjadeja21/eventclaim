import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add the Supabase Supavisor transaction-pooler " +
      "connection string (port 6543) to your environment."
  );
}

declare global {
  var __dbClient: postgres.Sql | undefined;
}

// Reuse the connection across hot reloads / lambda warm invocations instead
// of opening a new pool on every module reload.
const client =
  globalThis.__dbClient ??
  postgres(connectionString, {
    // Supavisor's transaction-mode pooler (port 6543) does not support
    // prepared statements — this must stay false or queries fail in prod.
    prepare: false,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbClient = client;
}

export const db = drizzle(client, { schema });
export type Database = typeof db;
