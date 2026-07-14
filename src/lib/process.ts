import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function runCommand(command: string, args: string[], timeout = 60_000) {
  return execFileAsync(command, args, {
    timeout,
    maxBuffer: 25 * 1024 * 1024,
    env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}` },
  });
}
