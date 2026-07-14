import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { query } from "@/lib/db";
import { getItemDir } from "@/lib/config";
import { extractFileText } from "@/lib/extract";
import { sourceTypeForUpload } from "@/lib/ingest";
import { getItem } from "@/lib/items";
import { persistItemSnapshot, safeFileName } from "@/lib/vault-files";
import { createFilePreview } from "@/lib/previews";
import { DEFAULT_BOARD_ID } from "@/lib/boards";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const boardId = String(form.get("boardId") || DEFAULT_BOARD_ID);
    if (!(file instanceof File) || !file.size) return Response.json({ error: "Choose a file first." }, { status: 400 });
    if (file.size > 2 * 1024 * 1024 * 1024) return Response.json({ error: "The MVP supports files up to 2 GB." }, { status: 400 });

    const id = randomUUID();
    const directory = getItemDir(id);
    await mkdir(directory, { recursive: true });
    const fileName = safeFileName(file.name);
    const filePath = path.join(directory, fileName);
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
    const contentText = await extractFileText(filePath, file.type, fileName).catch(() => null);
    const sourceType = sourceTypeForUpload(file);
    const transcriptStatus = ['audio', 'video'].includes(sourceType) ? 'not_requested' : 'not_applicable';
    const previewPath = await createFilePreview(filePath, file.type, fileName).catch(() => null);

    await query(`
      INSERT INTO content_items (
        id, board_id, source_type, title, description, content_text, transcript_status,
        mime_type, file_path, preview_path, file_name, file_size, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
    `, [id, boardId, sourceType, fileName, contentText ? "Text extracted and searchable." : "Stored in the local vault.", contentText, transcriptStatus, file.type || null, filePath, previewPath, fileName, file.size, JSON.stringify({ originalName: file.name })]);
    const item = await getItem(id);
    if (!item) throw new Error("The uploaded item could not be read back.");
    await persistItemSnapshot(item);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 500 });
  }
}
