import { query } from "@/lib/db";
import type { Board, BoardKind } from "@/lib/types";

export const DEFAULT_BOARD_ID = "11111111-1111-4111-8111-111111111111";

export async function listBoards() {
  const result = await query<Board>(`
    SELECT b.id, b.name, b.kind, b.folder_id, b.sort_order, b.trashed_at,
           b.created_at, b.updated_at,
           CASE WHEN b.kind = 'thinking'
             THEN (SELECT COUNT(*)::int FROM thinking_cards tc WHERE tc.board_id = b.id)
             ELSE COUNT(i.id)::int
           END AS item_count
    FROM boards b
    LEFT JOIN content_items i ON i.board_id = b.id AND i.trashed_at IS NULL
    WHERE b.trashed_at IS NULL
    GROUP BY b.id
    ORDER BY b.sort_order ASC, b.created_at ASC
  `);
  return result.rows;
}

export async function createBoard(name: string, folderId: string | null = null, kind: BoardKind = "source") {
  const result = await query<Board>(`
    WITH new_board AS (
      INSERT INTO boards (name, folder_id, kind) VALUES ($1, $2, $3)
      RETURNING id, name, kind, folder_id, sort_order, trashed_at, created_at, updated_at
    ),
    default_columns AS (
      INSERT INTO thinking_columns (board_id, name, sort_order)
      SELECT new_board.id, defaults.name, defaults.sort_order
      FROM new_board
      CROSS JOIN (VALUES ('Ideas', 0), ('In progress', 1), ('Done', 2)) AS defaults(name, sort_order)
      WHERE new_board.kind = 'thinking'
    )
    SELECT id, name, kind, folder_id, sort_order, trashed_at,
           0::int AS item_count, created_at, updated_at
    FROM new_board
  `, [name, folderId, kind]);
  return result.rows[0];
}

export async function getBoard(id: string) {
  const result = await query<Board>(`
    SELECT b.id, b.name, b.kind, b.folder_id, b.sort_order, b.trashed_at,
           b.created_at, b.updated_at,
           CASE WHEN b.kind = 'thinking'
             THEN (SELECT COUNT(*)::int FROM thinking_cards tc WHERE tc.board_id = b.id)
             ELSE COUNT(i.id)::int
           END AS item_count
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
    RETURNING id, name, kind, folder_id, sort_order, trashed_at,
              CASE WHEN kind = 'thinking'
                THEN (SELECT COUNT(*)::int FROM thinking_cards WHERE board_id = boards.id)
                ELSE (SELECT COUNT(*)::int FROM content_items WHERE board_id = boards.id AND trashed_at IS NULL)
              END AS item_count,
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
    RETURNING id, name, kind, folder_id, sort_order, trashed_at,
              CASE WHEN kind = 'thinking'
                THEN (SELECT COUNT(*)::int FROM thinking_cards WHERE board_id = boards.id)
                ELSE (SELECT COUNT(*)::int FROM content_items WHERE board_id = boards.id)
              END AS item_count,
              created_at, updated_at
  `, [id]);
  return result.rows[0] || null;
}
