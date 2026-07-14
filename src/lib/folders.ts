import { getPool, query } from "@/lib/db";
import type { Folder } from "@/lib/types";

export async function listFolders() {
  const result = await query<Folder>(`
    SELECT f.id, f.parent_id, f.name, f.sort_order, f.trashed_at,
           f.created_at, f.updated_at,
           COUNT(DISTINCT b.id)::int AS board_count,
           COUNT(i.id)::int AS source_count
    FROM folders f
    LEFT JOIN boards b ON b.folder_id = f.id AND b.trashed_at IS NULL
    LEFT JOIN content_items i ON i.board_id = b.id AND i.trashed_at IS NULL
    WHERE f.trashed_at IS NULL
    GROUP BY f.id
    ORDER BY f.sort_order ASC, f.created_at ASC
  `);
  return result.rows;
}

export async function createFolder(name: string, parentId: string | null = null) {
  const result = await query<Folder>(`
    INSERT INTO folders (name, parent_id) VALUES ($1, $2)
    RETURNING id, parent_id, name, sort_order, trashed_at,
              0::int AS board_count, 0::int AS source_count,
              created_at, updated_at
  `, [name, parentId]);
  return result.rows[0];
}

async function wouldCreateCycle(id: string, parentId: string) {
  const result = await query<{ cycle: boolean }>(`
    WITH RECURSIVE descendants AS (
      SELECT id FROM folders WHERE id = $1
      UNION ALL
      SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
    )
    SELECT EXISTS(SELECT 1 FROM descendants WHERE id = $2) AS cycle
  `, [id, parentId]);
  return result.rows[0]?.cycle ?? false;
}

export async function updateFolder(id: string, changes: { name?: string; parentId?: string | null; restore?: boolean }) {
  const current = await query<Folder>("SELECT * FROM folders WHERE id = $1", [id]);
  if (!current.rows[0]) return null;
  const parentId = changes.parentId === undefined ? current.rows[0].parent_id : changes.parentId;
  if (parentId && await wouldCreateCycle(id, parentId)) throw new Error("A folder cannot be moved inside itself.");
  const name = changes.name === undefined ? current.rows[0].name : changes.name;
  const result = await query<Folder>(`
    UPDATE folders
    SET name = $2, parent_id = $3,
        trashed_at = CASE WHEN $4::boolean THEN NULL ELSE trashed_at END,
        updated_at = now()
    WHERE id = $1
    RETURNING id, parent_id, name, sort_order, trashed_at,
              (SELECT COUNT(*)::int FROM boards WHERE folder_id = folders.id AND trashed_at IS NULL) AS board_count,
              (SELECT COUNT(*)::int FROM content_items i JOIN boards b ON b.id = i.board_id WHERE b.folder_id = folders.id AND b.trashed_at IS NULL AND i.trashed_at IS NULL) AS source_count,
              created_at, updated_at
  `, [id, name, parentId, Boolean(changes.restore)]);
  return result.rows[0];
}

export async function trashFolder(id: string) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hierarchy = await client.query<{ id: string }>(`
      WITH RECURSIVE descendants AS (
        SELECT id FROM folders WHERE id = $1 AND trashed_at IS NULL
        UNION ALL
        SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id WHERE f.trashed_at IS NULL
      )
      SELECT id FROM descendants
    `, [id]);
    if (!hierarchy.rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    const folderIds = hierarchy.rows.map((row) => row.id);
    const remaining = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM boards
      WHERE trashed_at IS NULL AND (folder_id IS NULL OR NOT (folder_id = ANY($1::uuid[])))
    `, [folderIds]);
    if (Number(remaining.rows[0]?.count || 0) < 1) throw new Error("Keep at least one active board outside this folder.");
    await client.query("UPDATE boards SET trashed_at = now(), updated_at = now() WHERE folder_id = ANY($1::uuid[]) AND trashed_at IS NULL", [folderIds]);
    await client.query("UPDATE folders SET trashed_at = now(), updated_at = now() WHERE id = ANY($1::uuid[])", [folderIds]);
    await client.query("COMMIT");
    return { id, folderIds };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
