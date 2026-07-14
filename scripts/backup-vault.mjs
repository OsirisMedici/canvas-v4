import { copyFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { backupsDir, checksum, ensureVaultDirectories, manifestPath, pgTool, psql, timestamp } from "./vault-runtime.mjs";
import { database, port, user } from "./postgres-config.mjs";

async function main() {
  ensureVaultDirectories();
  if (psql("SELECT to_regclass('public.boards') IS NOT NULL;") !== "t") {
    process.stdout.write(`${JSON.stringify({ skipped: true, reason: "new database" })}\n`);
    return;
  }
  await import("./write-vault-manifest.mjs");
  const stamp = timestamp();
  const dump = path.join(backupsDir, `canvas-vault-${stamp}.dump`);
  const manifest = path.join(backupsDir, `canvas-vault-${stamp}.manifest.json`);
  pgTool("pg_dump", ["-h", "127.0.0.1", "-p", port, "-U", user, "-d", database, "-Fc", "-f", dump]);
  copyFileSync(manifestPath, manifest);
  const receipt = path.join(backupsDir, `canvas-vault-${stamp}.sha256.json`);
  writeFileSync(receipt, `${JSON.stringify({ createdAt: new Date().toISOString(), dump: path.basename(dump), sha256: checksum(dump), bytes: statSync(dump).size }, null, 2)}\n`);
  const dumps = readdirSync(backupsDir).filter((name) => name.endsWith(".dump") && /^(?:canvas|osiris)-vault-/.test(name)).sort().reverse();
  for (const old of dumps.slice(10)) {
    const stem = old.replace(/\.dump$/, "");
    for (const suffix of [".dump", ".manifest.json", ".sha256.json"]) rmSync(path.join(backupsDir, `${stem}${suffix}`), { force: true });
  }
  process.stdout.write(`${JSON.stringify({ dump, manifest, receipt })}\n`);
}

await main();
