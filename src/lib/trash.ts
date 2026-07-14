import { rm } from "node:fs/promises";
import { getPool, query } from "@/lib/db";
import { getItemDir } from "@/lib/config";

export type TrashType = "folder" | "board" | "item";

export async function listTrash() {
  const [folders, boards, items] = await Promise.all([
    query(`
      SELECT f.id, f.parent_id, f.name, f.trashed_at,
             (SELECT COUNT(*)::int FROM boards b WHERE b.folder_id = f.id) AS board_count
      FROM folders f WHERE f.trashed_at IS NOT NULL ORDER BY f.trashed_at DESC
    `),
    query(`
      SELECT b.id, b.folder_id, b.name, b.trashed_at, f.name AS folder_name,
             (SELECT COUNT(*)::int FROM content_items i WHERE i.board_id = b.id) AS item_count
      FROM boards b LEFT JOIN folders f ON f.id = b.folder_id
      WHERE b.trashed_at IS NOT NULL ORDER BY b.trashed_at DESC
    `),
    query(`
      SELECT i.id, i.board_id, i.title, i.source_type, i.file_name, i.trashed_at, b.name AS board_name
      FROM content_items i JOIN boards b ON b.id = i.board_id
      WHERE i.trashed_at IS NOT NULL ORDER BY i.trashed_at DESC
    `),
  ]);
  return { folders: folders.rows, boards: boards.rows, items: items.rows };
}

export async function restoreTrash(type: TrashType, id: string) {
  if (type === "item") {
    const result = await query("UPDATE content_items SET trashed_at = NULL, updated_at = now() WHERE id = $1 AND trashed_at IS NOT NULL RETURNING id", [id]);
    return result.rows[0] || null;
  }
  if (type === "board") {
    const result = await query(`
      UPDATE boards b SET trashed_at = NULL,
        folder_id = CASE WHEN f.id IS NULL OR f.trashed_at IS NOT NULL THEN NULL ELSE b.folder_id END,
        updated_at = now()
      FROM (SELECT $1::uuid AS board_id) input
      LEFT JOIN folders f ON f.id = (SELECT folder_id FROM boards WHERE id = input.board_id)
      WHERE b.id = input.board_id AND b.trashed_at IS NOT NULL
      RETURNING b.id
    `, [id]);
    if (result.rows[0]) await query("UPDATE chat_sessions SET trashed_at = NULL, updated_at = now() WHERE board_id = $1", [id]);
    return result.rows[0] || null;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hierarchy = await client.query<{ id: string }>(`
      WITH RECURSIVE descendants AS (
        SELECT id FROM folders WHERE id = $1 AND trashed_at IS NOT NULL
        UNION ALL
        SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id WHERE f.trashed_at IS NOT NULL
      ) SELECT id FROM descendants
    `, [id]);
    if (!hierarchy.rowCount) { await client.query("ROLLBACK"); return null; }
    const ids = hierarchy.rows.map((row) => row.id);
    await client.query(`
      UPDATE folders SET trashed_at = NULL,
        parent_id = CASE WHEN id = $1 AND parent_id IN (SELECT id FROM folders WHERE trashed_at IS NOT NULL) THEN NULL ELSE parent_id END,
        updated_at = now()
      WHERE id = ANY($2::uuid[])
    `, [id, ids]);
    await client.query("UPDATE boards SET trashed_at = NULL, updated_at = now() WHERE folder_id = ANY($1::uuid[])", [ids]);
    await client.query("UPDATE chat_sessions SET trashed_at = NULL, updated_at = now() WHERE board_id IN (SELECT id FROM boards WHERE folder_id = ANY($1::uuid[]))", [ids]);
    await client.query("COMMIT");
    return { id, folderIds: ids };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function removeItemDirectories(ids: string[]) {
  await Promise.all(ids.map((id) => rm(getItemDir(id), { recursive: true, force: true })));
}

export async function permanentlyDelete(type: TrashType, id: string) {
  if (type === "item") {
    const result = await query<{ id: string }>("DELETE FROM content_items WHERE id = $1 AND trashed_at IS NOT NULL RETURNING id", [id]);
    if (result.rows[0]) await removeItemDirectories([id]);
    return result.rows[0] || null;
  }

  const pool = getPool();
  const client = await pool.connect();
  let itemIds: string[] = [];
  try {
    await client.query("BEGIN");
    if (type === "board") {
      const board = await client.query("SELECT id FROM boards WHERE id = $1 AND trashed_at IS NOT NULL", [id]);
      if (!board.rowCount) { await client.query("ROLLBACK"); return null; }
      const items = await client.query<{ id: string }>("SELECT id FROM content_items WHERE board_id = $1", [id]);
      itemIds = items.rows.map((row) => row.id);
      await client.query("DELETE FROM boards WHERE id = $1", [id]);
    } else {
      const hierarchy = await client.query<{ id: string }>(`
        WITH RECURSIVE descendants AS (
          SELECT id FROM folders WHERE id = $1 AND trashed_at IS NOT NULL
          UNION ALL SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id WHERE f.trashed_at IS NOT NULL
        ) SELECT id FROM descendants
      `, [id]);
      if (!hierarchy.rowCount) { await client.query("ROLLBACK"); return null; }
      const folderIds = hierarchy.rows.map((row) => row.id);
      const items = await client.query<{ id: string }>("SELECT i.id FROM content_items i JOIN boards b ON b.id = i.board_id WHERE b.folder_id = ANY($1::uuid[])", [folderIds]);
      itemIds = items.rows.map((row) => row.id);
      await client.query("DELETE FROM boards WHERE folder_id = ANY($1::uuid[])", [folderIds]);
      await client.query("DELETE FROM folders WHERE id = ANY($1::uuid[])", [folderIds]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
  await removeItemDirectories(itemIds);
  return { id, itemIds };
}

export async function emptyTrash() {
  const trash = await listTrash();
  for (const item of trash.items as Array<{ id: string }>) await permanentlyDelete("item", item.id);
  for (const board of trash.boards as Array<{ id: string }>) await permanentlyDelete("board", board.id);
  const folders = trash.folders as Array<{ id: string; parent_id: string | null }>;
  const folderIds = new Set(folders.map((folder) => folder.id));
  for (const folder of folders.filter((entry) => !entry.parent_id || !folderIds.has(entry.parent_id))) await permanentlyDelete("folder", folder.id);
  return { ok: true };
}
