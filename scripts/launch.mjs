import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { appLog, appPidFile, logsDir, root } from "./postgres-config.mjs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
execFileSync(npm, ["run", "db:start"], { cwd: root, stdio: "inherit" });
execFileSync(npm, ["run", "db:schema"], { cwd: root, stdio: "inherit" });
if (!existsSync(`${root}/.next/BUILD_ID`)) execFileSync(npm, ["run", "build"], { cwd: root, stdio: "inherit" });

if (existsSync(appPidFile)) {
  const oldPid = Number(readFileSync(appPidFile, "utf8"));
  try { process.kill(oldPid, 0); execFileSync("open", ["http://127.0.0.1:3217"]); process.exit(0); } catch { /* stale pid */ }
}

mkdirSync(logsDir, { recursive: true });
const fd = openSync(appLog, "a");
const child = spawn(npm, ["run", "start"], { cwd: root, detached: true, stdio: ["ignore", fd, fd], env: process.env });
child.unref(); closeSync(fd); writeFileSync(appPidFile, String(child.pid));

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch("http://127.0.0.1:3217/api/health");
    if (response.ok) { execFileSync("open", ["http://127.0.0.1:3217"]); process.stdout.write("Osiris Vault is open at http://127.0.0.1:3217\n"); process.exit(0); }
  } catch { /* wait */ }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
throw new Error(`The app did not start. Check ${appLog}`);
