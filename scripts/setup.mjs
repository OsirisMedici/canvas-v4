import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brew = "/opt/homebrew/bin/brew";
const requiredFormulae = ["postgresql@16", "ffmpeg", "poppler"];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

function succeeds(command, args) {
  return spawnSync(command, args, { cwd: root, stdio: "ignore" }).status === 0;
}

if (process.platform !== "darwin" || os.arch() !== "arm64") {
  throw new Error("Canvas Vault currently supports Apple Silicon Macs (M1 or newer).");
}

if (!existsSync(brew)) {
  throw new Error([
    "Homebrew is required but was not found at /opt/homebrew/bin/brew.",
    "Install Homebrew from https://brew.sh, then run npm run setup again.",
  ].join("\n"));
}

const missingFormulae = requiredFormulae.filter((formula) => !succeeds(brew, ["list", "--versions", formula]));
if (!succeeds("/usr/bin/which", ["yt-dlp"]) && !succeeds(brew, ["list", "--versions", "yt-dlp"])) {
  missingFormulae.push("yt-dlp");
}
if (missingFormulae.length) {
  process.stdout.write(`Installing required local tools: ${missingFormulae.join(", ")}\n`);
  run(brew, ["install", ...missingFormulae]);
}

process.stdout.write("Installing JavaScript dependencies…\n");
run("npm", ["ci"]);

process.stdout.write("Building and installing Canvas Vault…\n");
run("node", [path.join(root, "scripts", "install-desktop.mjs")]);

let health = null;
for (let attempt = 0; attempt < 90; attempt += 1) {
  try {
    const response = await fetch("http://127.0.0.1:3217/api/health", { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      health = await response.json();
      break;
    }
  } catch {
    // The desktop runtime is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

if (!health?.ok || health.app !== "Canvas Vault" || health.database?.status !== "connected") {
  throw new Error("Canvas Vault was installed, but its local runtime did not become healthy. Open the app and inspect its logs.");
}

process.stdout.write([
  "",
  "Canvas Vault is installed and running.",
  "Application: /Applications/Canvas Vault.app",
  "Local address: http://127.0.0.1:3217",
  `Canvas Workspace: ${health.workspaceDir}`,
  `Private library data: ${health.dataDir}`,
  "",
].join("\n"));
