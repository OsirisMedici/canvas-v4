import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { database, dataRoot, pgBin, port, user } from "./postgres-config.mjs";

export { dataRoot };
export const backupsDir = path.join(dataRoot, "backups");
export const exportsDir = path.join(dataRoot, "exports");
export const manifestPath = path.join(dataRoot, "vault-manifest.json");

export function ensureVaultDirectories() {
  for (const directory of [backupsDir, exportsDir]) mkdirSync(directory, { recursive: true });
}

export function psql(sql) {
  return execFileSync(path.join(pgBin, "psql"), ["-h", "127.0.0.1", "-p", port, "-U", user, "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 }).trim();
}

export function pgTool(name, args, options = {}) {
  return execFileSync(path.join(pgBin, name), args, { stdio: "inherit", ...options });
}

export function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function checksum(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
