import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = process.env.VAULT_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const dataRoot = process.env.VAULT_DATA_DIR || path.join(root, "data");
export const pgData = path.join(dataRoot, "postgres");
export const socketDir = path.join(pgData, "socket");
export const logsDir = process.env.VAULT_LOG_DIR || path.join(root, "logs");
export const pgLog = path.join(logsDir, "postgres.log");
export const appLog = path.join(logsDir, "app.log");
export const appPidFile = path.join(process.env.VAULT_RUNTIME_DIR || dataRoot, "app.pid");
export const port = process.env.VAULT_PG_PORT || "5447";
export const database = process.env.VAULT_PG_DATABASE || "osiris_vault";
export const user = process.env.VAULT_PG_USER || process.env.USER || "osirismedici";
export const pgBin = process.env.VAULT_PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
