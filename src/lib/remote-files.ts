import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { getItemDir } from "@/lib/config";
import { query } from "@/lib/db";
import { extractFileText } from "@/lib/extract";
import { getItem } from "@/lib/items";
import { createFilePreview } from "@/lib/previews";
import type { RemoteFile } from "@/lib/ingest";
import { persistItemSnapshot, safeFileName } from "@/lib/vault-files";

export async function attachRemoteFile(itemId: string, remote: RemoteFile) {
  const directory = getItemDir(itemId);
  await mkdir(directory, { recursive: true });
  const fileName = safeFileName(remote.fileName);
  const filePath = path.join(directory, fileName);
  await writeFile(filePath, remote.bytes);
  const contentText = await extractFileText(filePath, remote.mimeType, fileName).catch(() => null);
  const previewPath = await createFilePreview(filePath, remote.mimeType, fileName).catch(() => null);
  await query(`
    UPDATE content_items SET file_path = $2, preview_path = $3, file_name = $4, file_size = $5,
      mime_type = $6, content_text = COALESCE($7, content_text), updated_at = now()
    WHERE id = $1
  `, [itemId, filePath, previewPath, fileName, remote.bytes.byteLength, remote.mimeType, contentText]);
  const item = await getItem(itemId);
  if (!item) throw new Error("The captured file could not be read back.");
  await persistItemSnapshot(item);
  return item;
}
