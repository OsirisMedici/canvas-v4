import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { getThinkingCardDir } from "@/lib/config";
import { query } from "@/lib/db";
import type { ThinkingCard, ThinkingColumn } from "@/lib/types";

const columnFields = `
  c.id, c.board_id, c.name, c.sort_order, c.created_at, c.updated_at,
  (SELECT COUNT(*)::int FROM thinking_cards tc WHERE tc.column_id = c.id) AS card_count
`;

const cardFields = `
  id, board_id, column_id, title, content_text, sort_order, created_at, updated_at
`;

export async function getThinkingBoard(boardId: string) {
  const board = await query<{ id: string; kind: string }>(
    "SELECT id, kind FROM boards WHERE id = $1 AND trashed_at IS NULL",
    [boardId],
  );
  if (!board.rows[0] || board.rows[0].kind !== "thinking") return null;

  const [columns, cards] = await Promise.all([
    query<ThinkingColumn>(`
      SELECT ${columnFields}
      FROM thinking_columns c
      WHERE c.board_id = $1
      ORDER BY c.sort_order ASC, c.created_at ASC
    `, [boardId]),
    query<ThinkingCard>(`
      SELECT ${cardFields}
      FROM thinking_cards
      WHERE board_id = $1
      ORDER BY sort_order ASC, created_at ASC
    `, [boardId]),
  ]);
  return { columns: columns.rows, cards: cards.rows };
}

export async function createThinkingColumn(boardId: string, name: string) {
  const result = await query<ThinkingColumn>(`
    INSERT INTO thinking_columns (board_id, name, sort_order)
    SELECT b.id, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM thinking_columns WHERE board_id = b.id), 0)
    FROM boards b
    WHERE b.id = $1 AND b.kind = 'thinking' AND b.trashed_at IS NULL
    RETURNING id, board_id, name, sort_order, 0::int AS card_count, created_at, updated_at
  `, [boardId, name]);
  return result.rows[0] || null;
}

export async function updateThinkingColumn(id: string, name: string) {
  const result = await query<ThinkingColumn>(`
    UPDATE thinking_columns c
    SET name = $2, updated_at = now()
    WHERE id = $1
    RETURNING ${columnFields}
  `, [id, name]);
  return result.rows[0] || null;
}

export async function deleteThinkingColumn(id: string) {
  const cards = await query<{ id: string }>("SELECT id FROM thinking_cards WHERE column_id = $1", [id]);
  const result = await query<{ id: string }>("DELETE FROM thinking_columns WHERE id = $1 RETURNING id", [id]);
  if (!result.rows[0]) return null;
  await Promise.all(cards.rows.map((card) => removeThinkingCardDocument(card.id)));
  return result.rows[0];
}

export async function createThinkingCard(columnId: string, title: string) {
  const result = await query<ThinkingCard>(`
    INSERT INTO thinking_cards (board_id, column_id, title, sort_order)
    SELECT c.board_id, c.id, $2,
           COALESCE((SELECT MAX(tc.sort_order) + 1 FROM thinking_cards tc WHERE tc.column_id = c.id), 0)
    FROM thinking_columns c
    JOIN boards b ON b.id = c.board_id
    WHERE c.id = $1 AND b.kind = 'thinking' AND b.trashed_at IS NULL
    RETURNING ${cardFields}
  `, [columnId, title]);
  const card = result.rows[0] || null;
  if (card) await persistThinkingCardDocument(card);
  return card;
}

export async function getThinkingCard(id: string) {
  const result = await query<ThinkingCard>(`SELECT ${cardFields} FROM thinking_cards WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function updateThinkingCard(
  id: string,
  changes: { title?: string; contentText?: string; columnId?: string },
) {
  const current = await getThinkingCard(id);
  if (!current) return null;
  const title = changes.title === undefined ? current.title : changes.title;
  const contentText = changes.contentText === undefined ? current.content_text : changes.contentText;
  const columnId = changes.columnId === undefined ? current.column_id : changes.columnId;
  const result = await query<ThinkingCard>(`
    UPDATE thinking_cards card
    SET title = $2,
        content_text = $3,
        column_id = destination.id,
        sort_order = CASE
          WHEN destination.id <> card.column_id
            THEN COALESCE((SELECT MAX(sort_order) + 1 FROM thinking_cards WHERE column_id = destination.id), 0)
          ELSE card.sort_order
        END,
        updated_at = now()
    FROM thinking_columns destination
    WHERE card.id = $1
      AND destination.id = $4
      AND destination.board_id = card.board_id
    RETURNING card.id, card.board_id, card.column_id, card.title, card.content_text,
              card.sort_order, card.created_at, card.updated_at
  `, [id, title, contentText, columnId]);
  const card = result.rows[0] || null;
  if (card) await persistThinkingCardDocument(card);
  return card;
}

export async function deleteThinkingCard(id: string) {
  const result = await query<ThinkingCard>(`DELETE FROM thinking_cards WHERE id = $1 RETURNING ${cardFields}`, [id]);
  const card = result.rows[0] || null;
  if (card) await removeThinkingCardDocument(card.id);
  return card;
}

export async function persistThinkingCardDocument(card: ThinkingCard) {
  const directory = getThinkingCardDir(card.id);
  await mkdir(directory, { recursive: true });
  const markdown = `# ${card.title || "Untitled"}\n\n${card.content_text}`.trimEnd() + "\n";
  await Promise.all([
    writeFile(path.join(directory, "Notion.md"), markdown, "utf8"),
    writeFile(path.join(directory, "card.json"), `${JSON.stringify(card, null, 2)}\n`, "utf8"),
  ]);
}

async function removeThinkingCardDocument(id: string) {
  await rm(getThinkingCardDir(id), { recursive: true, force: true });
}
