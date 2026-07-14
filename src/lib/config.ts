import path from "node:path";
import { mkdir } from "node:fs/promises";

export function getDataDir() {
  return process.env.VAULT_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
}

export function getVaultDir() {
  return path.join(getDataDir(), "vault");
}

export function getItemDir(id: string) {
  return path.join(getVaultDir(), id);
}

export async function ensureDataDirectories() {
  await mkdir(getVaultDir(), { recursive: true });
}
