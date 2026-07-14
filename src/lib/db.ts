import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type QueryResultRow } from "pg";

let pool: Pool | null = null;
let schemaPromise: Promise<void> | null = null;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured.");
    pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const schemaPath = process.env.VAULT_SCHEMA_PATH || path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "schema.sql");
      const sql = await readFile(schemaPath, "utf8");
      await getPool().query(sql);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  await ensureSchema();
  return getPool().query<T>(text, values);
}
