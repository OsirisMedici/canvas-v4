import { execFileSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { pgBin, pgData } from "./postgres-config.mjs";

if (!existsSync(path.join(pgData, "PG_VERSION"))) process.exit(0);
try {
  execFileSync(path.join(pgBin, "pg_ctl"), ["-D", pgData, "-w", "stop", "-m", "fast"], { stdio: "inherit" });
} catch {
  process.exitCode = 0;
}
