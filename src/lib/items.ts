import { query } from "@/lib/db";
import { persistItemSnapshot } from "@/lib/vault-files";
import type { ContentItem, VaultStats } from "@/lib/types";

const fields = `
  id, board_id, source_type, canonical_url, external_id, title, author, description, content_text,
  transcript_text, transcript_status, transcript_origin, transcript_language, transcript_error,
  thumbnail_url, published_at, duration_seconds, view_count, mime_type, file_path, preview_path, file_name,
  file_size, trashed_at, metadata, created_at, updated_at
`;

export async function listItems(search = "", type = "all", boardId?: string) {
  const values: unknown[] = [];
  const clauses: string[] = ["trashed_at IS NULL"];

  if (boardId) {
    values.push(boardId);
    clauses.push(`board_id = $${values.length}`);
  }

  if (search.trim()) {
    values.push(search.trim());
    clauses.push(`(
      search_vector @@ websearch_to_tsquery('english', $${values.length})
      OR title ILIKE '%' || $${values.length} || '%'
      OR author ILIKE '%' || $${values.length} || '%'
    )`);
  }

  if (type !== "all") {
    if (type === "file") {
      clauses.push("source_type IN ('document', 'image', 'audio', 'video', 'file')");
    } else {
      values.push(type);
      clauses.push(`source_type = $${values.length}`);
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await query<ContentItem>(`
    SELECT ${fields}
    FROM content_items
    ${where}
    ORDER BY created_at DESC
    LIMIT 500
  `, values);
  return result.rows;
}

export async function getItem(id: string) {
  const result = await query<ContentItem>(`SELECT ${fields} FROM content_items WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function getStats(): Promise<VaultStats> {
  const result = await query<VaultStats>(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE source_type = 'youtube')::int AS youtube,
      COUNT(*) FILTER (WHERE source_type = 'article')::int AS article,
      COUNT(*) FILTER (WHERE source_type = 'note')::int AS note,
      COUNT(*) FILTER (WHERE source_type IN ('document', 'image', 'audio', 'video', 'file'))::int AS file,
      COUNT(*) FILTER (WHERE transcript_status = 'ready')::int AS ready_transcripts
    FROM content_items
    WHERE trashed_at IS NULL
  `);
  return result.rows[0];
}

export async function createNote(title: string, body: string, boardId: string) {
  const result = await query<ContentItem>(`
    INSERT INTO content_items (board_id, source_type, title, description, content_text, transcript_status)
    VALUES ($1, 'note', $2, $3, $3, 'not_applicable')
    RETURNING ${fields}
  `, [boardId, title, body]);
  const item = result.rows[0];
  await persistItemSnapshot(item);
  return item;
}

export async function saveIngestedItem(data: Partial<ContentItem> & Pick<ContentItem, "source_type" | "title">, boardId: string) {
  const result = await query<ContentItem>(`
    INSERT INTO content_items (
      board_id, source_type, canonical_url, external_id, title, author, description, content_text,
      transcript_status, thumbnail_url, published_at, duration_seconds, view_count, mime_type, metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15::jsonb
    )
    ON CONFLICT (canonical_url) WHERE canonical_url IS NOT NULL
    DO UPDATE SET board_id = EXCLUDED.board_id, trashed_at = NULL, updated_at = now()
    RETURNING ${fields}
  `, [
    boardId,
    data.source_type,
    data.canonical_url || null,
    data.external_id || null,
    data.title,
    data.author || null,
    data.description || null,
    data.content_text || null,
    data.transcript_status || "not_requested",
    data.thumbnail_url || null,
    data.published_at || null,
    data.duration_seconds || null,
    data.view_count || null,
    data.mime_type || null,
    JSON.stringify(data.metadata || {}),
  ]);
  const item = result.rows[0];
  await persistItemSnapshot(item);
  return item;
}

export async function trashItem(id: string) {
  const result = await query<ContentItem>(`UPDATE content_items SET trashed_at = now(), updated_at = now() WHERE id = $1 AND trashed_at IS NULL RETURNING ${fields}`, [id]);
  return result.rows[0] || null;
}
