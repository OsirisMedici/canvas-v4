import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataRoot, ensureVaultDirectories, manifestPath, psql } from "./vault-runtime.mjs";

ensureVaultDirectories();
let previous = {};
if (existsSync(manifestPath)) {
  try { previous = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { /* Rebuild malformed metadata. */ }
}
const counts = JSON.parse(psql(`SELECT json_build_object(
  'folders', (SELECT count(*) FROM folders),
  'boards', (SELECT count(*) FROM boards),
  'items', (SELECT count(*) FROM content_items),
  'chats', (SELECT count(*) FROM chat_sessions),
  'messages', (SELECT count(*) FROM chat_messages),
  'schemaVersion', (SELECT max(version) FROM vault_schema_migrations)
)::text;`));
const manifest = {
  format: "com.osirismedici.canvas-vault",
  formatVersion: 1,
  appVersion: process.env.VAULT_APP_VERSION || "0.1.0",
  vaultId: previous.vaultId || psql("SELECT gen_random_uuid()::text;"),
  createdAt: previous.createdAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  database: { engine: "postgresql", version: 16, schemaVersion: counts.schemaVersion },
  paths: { data: dataRoot, files: path.join(dataRoot, "vault"), backups: path.join(dataRoot, "backups") },
  counts,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
