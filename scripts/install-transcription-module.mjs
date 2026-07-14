import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const support = process.env.VAULT_RUNTIME_DIR || path.join(os.homedir(), "Library", "Application Support", "Canvas Vault");
const runtime = path.join(support, "runtime");
const venv = path.join(runtime, "venv");
mkdirSync(runtime, { recursive: true });
const candidates = [process.env.TRANSCRIPTION_BOOTSTRAP_PYTHON, "/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"].filter(Boolean);
const python = candidates.find((candidate) => existsSync(candidate));
if (!python) throw new Error("Python 3 was not found. Install Python 3, then run this action again.");
if (!existsSync(path.join(venv, "bin", "python"))) execFileSync(python, ["-m", "venv", venv], { stdio: "inherit" });
const modulePython = path.join(venv, "bin", "python");
execFileSync(modulePython, ["-m", "pip", "install", "--upgrade", "pip", "faster-whisper"], { stdio: "inherit", timeout: 20 * 60 * 1000 });
execFileSync(modulePython, ["-c", "import faster_whisper"], { stdio: "inherit" });
process.stdout.write(`${modulePython}\n`);
