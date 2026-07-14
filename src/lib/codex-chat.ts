import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir, readFile, rm } from "node:fs/promises";
import { getDataDir, getVaultDir } from "@/lib/config";

function runCodex(prompt: string, outputPath: string) {
  const binary = process.env.CODEX_BIN || "/opt/homebrew/bin/codex";
  const args = [
    "exec",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--disable", "apps",
    "--disable", "plugins",
    "--disable", "memories",
    "--disable", "multi_agent",
    "--color", "never",
    "-c", 'model_reasoning_effort="low"',
    "-C", getVaultDir(),
    "-o", outputPath,
    "-",
  ];

  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { cwd: getVaultDir(), env: process.env, stdio: ["pipe", "ignore", "pipe"] });
    let errors = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("The local Codex agent took too long to answer."));
    }, 300_000);
    child.stderr.on("data", (chunk) => { errors += chunk.toString(); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(errors.trim().split("\n").slice(-4).join("\n") || `Codex exited with code ${code}.`));
    });
    child.stdin.end(prompt);
  });
}

export async function askCodex(prompt: string) {
  const directory = path.join(getDataDir(), "chats", "tmp");
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, `${randomUUID()}.txt`);
  try {
    await runCodex(prompt, outputPath);
    const answer = (await readFile(outputPath, "utf8")).trim();
    if (!answer) throw new Error("The local Codex agent returned an empty response.");
    return answer;
  } finally {
    await rm(outputPath, { force: true }).catch(() => undefined);
  }
}
