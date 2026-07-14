import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceApp = path.join(root, "dist", "electron", "Osiris Vault.app");
const installedApp = "/Applications/Osiris Vault.app";
const support = path.join(os.homedir(), "Library", "Application Support", "Osiris Vault");
const logs = path.join(os.homedir(), "Library", "Logs", "Osiris Vault");
const runtime = path.join(support, "runtime");
const runtimeVenv = path.join(runtime, "venv");
const configPath = path.join(support, "runtime.json");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status || 1);
}

run("node", [path.join(root, "scripts", "build-desktop.mjs")]);
mkdirSync(runtime, { recursive: true });
mkdirSync(logs, { recursive: true });

if (!existsSync(runtimeVenv)) {
  const sourceVenv = path.join(root, ".venv");
  if (!existsSync(sourceVenv)) throw new Error("Whisper environment is missing. Run npm run setup:transcription, then install again.");
  run("/usr/bin/ditto", [sourceVenv, runtimeVenv]);
}

const runtimePython = path.join(runtimeVenv, "bin", "python");
run(runtimePython, ["-c", "import faster_whisper"]);

if (!existsSync(configPath)) {
  writeFileSync(configPath, JSON.stringify({
    dataDir: path.join(root, "data"),
    pgBin: "/opt/homebrew/opt/postgresql@16/bin",
    ffmpeg: "/opt/homebrew/bin/ffmpeg",
    pdftoppm: "/opt/homebrew/bin/pdftoppm",
    codex: "/opt/homebrew/bin/codex",
    ytDlp: "/Library/Frameworks/Python.framework/Versions/3.13/bin/yt-dlp",
    transcribePython: runtimePython,
  }, null, 2));
} else {
  const existing = JSON.parse(readFileSync(configPath, "utf8"));
  if (!existing.transcribePython || !existsSync(existing.transcribePython)) {
    existing.transcribePython = runtimePython;
    writeFileSync(configPath, JSON.stringify(existing, null, 2));
  }
}

rmSync(installedApp, { recursive: true, force: true });
run("/usr/bin/ditto", [sourceApp, installedApp]);
spawnSync("/usr/bin/xattr", ["-cr", installedApp], { cwd: root, stdio: "ignore" });
run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", installedApp]);
run("/usr/bin/open", [installedApp]);
process.stdout.write(`Installed ${installedApp}\nData preserved at ${path.join(root, "data")}\n`);
