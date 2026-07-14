import { existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { appPidFile, root } from "./postgres-config.mjs";

if (existsSync(appPidFile)) {
  const pid = Number(readFileSync(appPidFile, "utf8"));
  try { process.kill(-pid, "SIGTERM"); } catch {
    try { process.kill(pid, "SIGTERM"); } catch { /* already stopped */ }
  }
  rmSync(appPidFile, { force: true });
}
execFileSync("npm", ["run", "db:stop"], { cwd: root, stdio: "inherit" });
