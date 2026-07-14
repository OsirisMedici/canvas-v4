import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataRoot, ensureVaultDirectories, manifestPath, psql, timestamp } from "./vault-runtime.mjs";
import "./write-vault-manifest.mjs";

ensureVaultDirectories();
const vaultDir = path.join(dataRoot, "vault");
const database = JSON.parse(psql(`SELECT json_build_object(
  'orphanItems', (SELECT count(*) FROM content_items i LEFT JOIN boards b ON b.id=i.board_id WHERE b.id IS NULL),
  'orphanBoards', (SELECT count(*) FROM boards b LEFT JOIN folders f ON f.id=b.folder_id WHERE b.folder_id IS NOT NULL AND f.id IS NULL),
  'folderCycles', (WITH RECURSIVE walk AS (SELECT id,parent_id,ARRAY[id] path,false cycle FROM folders UNION ALL SELECT f.id,f.parent_id,w.path||f.id,f.id=ANY(w.path) FROM folders f JOIN walk w ON f.id=w.parent_id WHERE NOT w.cycle) SELECT count(*) FROM walk WHERE cycle),
  'items', (SELECT count(*) FROM content_items),
  'fileItems', (SELECT count(*) FROM content_items WHERE file_path IS NOT NULL)
)::text;`));
const itemDirectories = existsSync(vaultDir) ? readdirSync(vaultDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length : 0;
const report = {
  checkedAt: new Date().toISOString(), manifest: existsSync(manifestPath), database,
  disk: { itemDirectories, vaultBytes: existsSync(vaultDir) ? readdirSync(vaultDir).reduce((sum, name) => { try { return sum + statSync(path.join(vaultDir, name)).size; } catch { return sum; } }, 0) : 0 },
  healthy: Number(database.orphanItems) === 0 && Number(database.orphanBoards) === 0 && Number(database.folderCycles) === 0,
};
const reportPath = path.join(dataRoot, "backups", `integrity-${timestamp()}.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ...report, reportPath })}\n`);
