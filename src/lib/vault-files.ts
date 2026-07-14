import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { getItemDir } from "@/lib/config";
import type { ContentItem } from "@/lib/types";

export function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "-").replace(/\s+/g, " ").slice(0, 180) || "file";
}

export async function persistItemSnapshot(item: ContentItem) {
  const directory = getItemDir(item.id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "item.json"), `${JSON.stringify(item, null, 2)}\n`, "utf8");
  if (item.content_text) await writeFile(path.join(directory, "content.txt"), item.content_text, "utf8");
  if (item.transcript_text) await writeFile(path.join(directory, "transcript.txt"), item.transcript_text, "utf8");
}

export function isInsideVault(candidate: string, vaultRoot: string) {
  const relative = path.relative(vaultRoot, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
