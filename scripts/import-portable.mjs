import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { database, dataRoot, pgBin, port, user } from "./postgres-config.mjs";

const sqlitePath = path.join(dataRoot, "vault.sqlite");
const marker = path.join(dataRoot, ".portable-imported.json");
if (!existsSync(sqlitePath) || existsSync(marker)) {
  process.stdout.write(`${JSON.stringify({ skipped: true })}\n`);
} else {
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const read = (table) => sqlite.prepare(`SELECT * FROM ${table}`).all();
  const folders = read("folders");
  const boards = read("boards");
  const items = read("content_items");
  const chats = read("chat_sessions");
  const messages = read("chat_messages");
  sqlite.close();
  const filesSource = path.join(dataRoot, "files");
  const vaultDir = path.join(dataRoot, "vault");
  if (existsSync(filesSource)) {
    mkdirSync(vaultDir, { recursive: true });
    cpSync(filesSource, vaultDir, { recursive: true, force: false, errorOnExist: false });
  }
  for (const item of items) {
    const directory = path.join(vaultDir, item.id);
    item.file_path = item.file_name && existsSync(path.join(directory, item.file_name)) ? path.join(directory, item.file_name) : null;
    item.preview_path = existsSync(path.join(directory, "preview.jpg")) ? path.join(directory, "preview.jpg") : null;
  }
  const delimiter = `osiris_${randomUUID().replaceAll("-", "")}`;
  const json = (value) => `$${delimiter}$${JSON.stringify(value)}$${delimiter}$::jsonb`;
  const sql = `BEGIN;
    INSERT INTO folders (id,parent_id,name,sort_order,trashed_at,created_at,updated_at)
      SELECT id::uuid,parent_id::uuid,name,sort_order,trashed_at::timestamptz,created_at::timestamptz,updated_at::timestamptz
      FROM jsonb_to_recordset(${json(folders)}) AS x(id text,parent_id text,name text,sort_order int,trashed_at text,created_at text,updated_at text)
      ON CONFLICT (id) DO UPDATE SET parent_id=EXCLUDED.parent_id,name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,trashed_at=EXCLUDED.trashed_at,updated_at=EXCLUDED.updated_at;
    INSERT INTO boards (id,folder_id,name,sort_order,trashed_at,created_at,updated_at)
      SELECT id::uuid,folder_id::uuid,name,sort_order,trashed_at::timestamptz,created_at::timestamptz,updated_at::timestamptz
      FROM jsonb_to_recordset(${json(boards)}) AS x(id text,folder_id text,name text,sort_order int,trashed_at text,created_at text,updated_at text)
      ON CONFLICT (id) DO UPDATE SET folder_id=EXCLUDED.folder_id,name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,trashed_at=EXCLUDED.trashed_at,updated_at=EXCLUDED.updated_at;
    INSERT INTO content_items (id,board_id,source_type,canonical_url,external_id,title,author,description,content_text,transcript_text,transcript_status,transcript_origin,transcript_language,transcript_error,thumbnail_url,published_at,duration_seconds,view_count,mime_type,file_path,preview_path,file_name,file_size,trashed_at,metadata,created_at,updated_at)
      SELECT id::uuid,board_id::uuid,source_type,canonical_url,external_id,title,author,description,content_text,transcript_text,transcript_status,transcript_origin,transcript_language,transcript_error,thumbnail_url,published_at::timestamptz,duration_seconds,view_count,mime_type,file_path,preview_path,file_name,file_size,trashed_at::timestamptz,COALESCE(metadata_json::jsonb,'{}'::jsonb),created_at::timestamptz,updated_at::timestamptz
      FROM jsonb_to_recordset(${json(items)}) AS x(id text,board_id text,source_type text,canonical_url text,external_id text,title text,author text,description text,content_text text,transcript_text text,transcript_status text,transcript_origin text,transcript_language text,transcript_error text,thumbnail_url text,published_at text,duration_seconds int,view_count bigint,mime_type text,file_path text,preview_path text,file_name text,file_size bigint,trashed_at text,metadata_json text,created_at text,updated_at text)
      ON CONFLICT (id) DO UPDATE SET board_id=EXCLUDED.board_id,title=EXCLUDED.title,content_text=EXCLUDED.content_text,transcript_text=EXCLUDED.transcript_text,file_path=EXCLUDED.file_path,preview_path=EXCLUDED.preview_path,trashed_at=EXCLUDED.trashed_at,metadata=EXCLUDED.metadata,updated_at=EXCLUDED.updated_at;
    INSERT INTO chat_sessions (id,board_id,title,scope_type,source_item_ids,trashed_at,created_at,updated_at)
      SELECT id::uuid,board_id::uuid,title,scope_type,ARRAY(SELECT jsonb_array_elements_text(COALESCE(source_item_ids_json::jsonb,'[]'::jsonb))::uuid),trashed_at::timestamptz,created_at::timestamptz,updated_at::timestamptz
      FROM jsonb_to_recordset(${json(chats)}) AS x(id text,board_id text,title text,scope_type text,source_item_ids_json text,trashed_at text,created_at text,updated_at text)
      ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,source_item_ids=EXCLUDED.source_item_ids,trashed_at=EXCLUDED.trashed_at,updated_at=EXCLUDED.updated_at;
    INSERT INTO chat_messages (id,session_id,role,content,created_at)
      SELECT id::uuid,session_id::uuid,role,content,created_at::timestamptz
      FROM jsonb_to_recordset(${json(messages)}) AS x(id text,session_id text,role text,content text,created_at text)
      ON CONFLICT (id) DO NOTHING;
    COMMIT;`;
  const result = spawnSync(path.join(pgBin, "psql"), ["-h", "127.0.0.1", "-p", port, "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 100 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || "Portable import failed.");
  const receipt = { importedAt: new Date().toISOString(), sqlitePath, counts: { folders: folders.length, boards: boards.length, items: items.length, chats: chats.length, messages: messages.length } };
  writeFileSync(marker, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
