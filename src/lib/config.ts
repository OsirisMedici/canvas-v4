import path from "node:path";
import os from "node:os";
import { mkdir } from "node:fs/promises";

export function getDataDir() {
  return process.env.VAULT_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
}

export function getVaultDir() {
  return path.join(getDataDir(), "vault");
}

export function getWorkspaceDir() {
  return process.env.CANVAS_WORKSPACE_DIR || path.join(os.homedir(), "Documents", "Canvas Workspace");
}

export function getItemDir(id: string) {
  return path.join(getVaultDir(), id);
}

export function getThinkingCardDir(id: string) {
  return path.join(getVaultDir(), "thinking-cards", id);
}

export async function ensureDataDirectories() {
  await mkdir(getVaultDir(), { recursive: true });
}
