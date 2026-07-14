import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const appPath = path.join(root, "dist", "electron", "Osiris Vault.app");
const releaseDir = path.join(root, "dist", "release", packageJson.version);
const zipPath = path.join(releaseDir, `Osiris-Vault-${packageJson.version}-arm64.zip`);
const identity = process.env.APPLE_SIGNING_IDENTITY;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (process.env.OSIRIS_SKIP_BUILD !== "1") run("node", [path.join(root, "scripts", "build-desktop.mjs")]);
let channel = "local-adhoc";
if (identity) {
  run("/usr/bin/codesign", ["--force", "--deep", "--options", "runtime", "--timestamp", "--entitlements", path.join(root, "assets", "desktop-entitlements.plist"), "--sign", identity, appPath]);
  channel = "developer-id";
}
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });
run("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, zipPath]);
if (identity && process.env.APPLE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_APP_PASSWORD) {
  run("/usr/bin/xcrun", ["notarytool", "submit", zipPath, "--apple-id", process.env.APPLE_ID, "--team-id", process.env.APPLE_TEAM_ID, "--password", process.env.APPLE_APP_PASSWORD, "--wait"]);
  run("/usr/bin/xcrun", ["stapler", "staple", appPath]);
  rmSync(zipPath, { force: true });
  run("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appPath, zipPath]);
  channel = "notarized";
}
const sha256 = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
const release = {
  product: "Canvas v4 — Osiris Vault", version: packageJson.version, architecture: "arm64", channel,
  publishedAt: new Date().toISOString(), file: path.basename(zipPath), sha256,
  url: process.env.OSIRIS_UPDATE_DOWNLOAD_URL || null,
  notes: "Folder hierarchy, Trash and restore, direct PDF capture, backups, portable exports, embedded native runtime, and update notifications.",
  dataBoundary: "Updates replace only Osiris Vault.app. External vault folders are never included.",
};
writeFileSync(path.join(releaseDir, "release.json"), `${JSON.stringify(release, null, 2)}\n`);
writeFileSync(path.join(releaseDir, "SHA256SUMS"), `${sha256}  ${path.basename(zipPath)}\n`);
process.stdout.write(`${releaseDir}\n`);
