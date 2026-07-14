import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceApp = path.join(root, "dist", "electron", "Canvas Vault.app");
const installedApp = "/Applications/Canvas Vault.app";
const support = path.join(os.homedir(), "Library", "Application Support", "Canvas Vault");
const previousSupportDirectories = ["Canvas v4", "Osiris Vault"].map((name) => path.join(os.homedir(), "Library", "Application Support", name));
const logs = path.join(os.homedir(), "Library", "Logs", "Canvas Vault");
const runtime = path.join(support, "runtime");
const runtimeVenv = path.join(runtime, "venv");
const configPath = path.join(support, "runtime.json");
const previousConfigPaths = previousSupportDirectories.map((directory) => path.join(directory, "runtime.json"));
const workspaceDir = path.join(os.homedir(), "Documents", "Canvas Workspace");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status || 1);
}

run("node", [path.join(root, "scripts", "build-desktop.mjs")]);
mkdirSync(runtime, { recursive: true });
mkdirSync(logs, { recursive: true });

if (!existsSync(runtimeVenv) && !existsSync(configPath) && !previousConfigPaths.some(existsSync)) {
  const sourceVenv = path.join(root, ".venv");
  if (existsSync(sourceVenv)) run("/usr/bin/ditto", [sourceVenv, runtimeVenv]);
}

const runtimePython = path.join(runtimeVenv, "bin", "python");
const sourceConfigPath = existsSync(configPath) ? configPath : previousConfigPaths.find(existsSync);
const existing = sourceConfigPath ? JSON.parse(readFileSync(sourceConfigPath, "utf8")) : {};
const config = {
    ...existing,
    dataDir: existing.dataDir || path.join(support, "Data"),
    workspaceDir: existing.workspaceDir || workspaceDir,
    pgBin: existing.pgBin || "/opt/homebrew/opt/postgresql@16/bin",
    ffmpeg: existing.ffmpeg || "/opt/homebrew/bin/ffmpeg",
    pdftoppm: existing.pdftoppm || "/opt/homebrew/bin/pdftoppm",
    ytDlp: existing.ytDlp || "/Library/Frameworks/Python.framework/Versions/3.13/bin/yt-dlp",
    transcribePython: existing.transcribePython && existsSync(existing.transcribePython)
      ? existing.transcribePython
      : existsSync(runtimePython) ? runtimePython : existing.transcribePython,
};
delete config.codex;
mkdirSync(config.dataDir, { recursive: true });
mkdirSync(config.workspaceDir, { recursive: true });
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

rmSync(installedApp, { recursive: true, force: true });
run("/usr/bin/ditto", [sourceApp, installedApp]);
spawnSync("/usr/bin/xattr", ["-cr", installedApp], { cwd: root, stdio: "ignore" });
run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", installedApp]);
run("/usr/bin/open", [installedApp]);
process.stdout.write(`Installed ${installedApp}\nLibrary data: ${config.dataDir}\nCanvas Workspace: ${config.workspaceDir}\n`);
