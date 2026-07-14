import { execFileSync } from "node:child_process";
import path from "node:path";
import { database, pgBin, port, root, user } from "./postgres-config.mjs";

const schemaPath = process.env.VAULT_SCHEMA_PATH || path.join(root, "scripts", "schema.sql");
execFileSync(path.join(pgBin, "psql"), ["-h", "127.0.0.1", "-p", port, "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-f", schemaPath], { stdio: "inherit" });
