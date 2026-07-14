import { query } from "@/lib/db";
import type { Board } from "@/lib/types";

export const DEFAULT_BOARD_ID = "11111111-1111-4111-8111-111111111111";

export async function listBoards() {
  const result = await query<Board>(`
    SELECT b.id, b.name, b.folder_id, b.sort_order, b.trashed_at,
           b.created_at, b.updated_at, COUNT(i.id)::int AS item_count
    FROM boards b
    LEFT JOIN content_items i ON i.board_id = b.id AND i.trashed_at IS NULL
    WHERE b.trashed_at IS NULL
    GROUP BY b.id
    ORDER BY b.sort_order ASC, b.created_at ASC
  `);
  return result.rows;
}

export async function createBoard(name: string, folderId: string | null = null) {
  const result = await query<Board>(`
    INSERT INTO boards (name, folder_id) VALUES ($1, $2)
    RETURNING id, name, folder_id, sort_order, trashed_at,
              0::int AS item_count, created_at, updated_at
  `, [name, folderId]);
  return result.rows[0];
}

export async function getBoard(id: string) {
  const result = await query<Board>(`
    SELECT b.id, b.name, b.folder_id, b.sort_order, b.trashed_at,
           b.created_at, b.updated_at, COUNT(i.id)::int AS item_count
    FROM boards b
    LEFT JOIN content_items i ON i.board_id = b.id AND i.trashed_at IS NULL
    WHERE b.id = $1 AND b.trashed_at IS NULL
    GROUP BY b.id
  `, [id]);
  return result.rows[0] || null;
}

export async function updateBoard(id: string, changes: { name?: string; folderId?: string | null; restore?: boolean }) {
  const current = await query<Board>("SELECT * FROM boards WHERE id = $1", [id]);
  if (!current.rows[0]) return null;
  const name = changes.name === undefined ? current.rows[0].name : changes.name;
  const folderId = changes.folderId === undefined ? current.rows[0].folder_id : changes.folderId;
  const result = await query<Board>(`
    UPDATE boards
    SET name = $2, folder_id = $3,
        trashed_at = CASE WHEN $4::boolean THEN NULL ELSE trashed_at END,
        updated_at = now()
    WHERE id = $1
    RETURNING id, name, folder_id, sort_order, trashed_at,
              (SELECT COUNT(*)::int FROM content_items WHERE board_id = boards.id AND trashed_at IS NULL) AS item_count,
              created_at, updated_at
  `, [id, name, folderId, Boolean(changes.restore)]);
  return result.rows[0];
}

export async function trashBoard(id: string) {
  const result = await query<Board>(`
    UPDATE boards
    SET trashed_at = now(), updated_at = now()
    WHERE id = $1
      AND trashed_at IS NULL
      AND (SELECT COUNT(*) FROM boards WHERE trashed_at IS NULL) > 1
    RETURNING id, name, folder_id, sort_order, trashed_at,
              (SELECT COUNT(*)::int FROM content_items WHERE board_id = boards.id) AS item_count,
              created_at, updated_at
  `, [id]);
  if (result.rows[0]) await query("UPDATE chat_sessions SET trashed_at = now(), updated_at = now() WHERE board_id = $1 AND trashed_at IS NULL", [id]);
  return result.rows[0] || null;
}
