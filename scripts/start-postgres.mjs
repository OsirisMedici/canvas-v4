import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { database, logsDir, pgBin, pgData, pgLog, port, socketDir, user } from "./postgres-config.mjs";

mkdirSync(logsDir, { recursive: true });
mkdirSync(path.dirname(pgData), { recursive: true });

const run = (name, args, options = {}) => execFileSync(path.join(pgBin, name), args, { stdio: "pipe", encoding: "utf8", ...options });

if (!existsSync(path.join(pgData, "PG_VERSION"))) {
  run("initdb", ["-D", pgData, "--auth=trust", "--username", user, "--encoding=UTF8", "--locale=C"]);
  mkdirSync(socketDir, { recursive: true });
  appendFileSync(path.join(pgData, "postgresql.conf"), `\nlisten_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = '${socketDir}'\nmax_connections = 20\nshared_buffers = '128MB'\n`);
}

try {
  run("pg_ctl", ["-D", pgData, "status"]);
} catch {
  run("pg_ctl", ["-D", pgData, "-l", pgLog, "-w", "start"]);
}

const exists = run("psql", ["-h", "127.0.0.1", "-p", port, "-U", user, "-d", "postgres", "-Atc", `SELECT 1 FROM pg_database WHERE datname = '${database}'`]).trim();
if (exists !== "1") run("createdb", ["-h", "127.0.0.1", "-p", port, "-U", user, database]);

process.stdout.write(`PostgreSQL is ready at 127.0.0.1:${port}/${database}\n`);
