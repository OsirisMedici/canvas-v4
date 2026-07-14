import { DatabaseSync } from "node:sqlite";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataRoot, ensureVaultDirectories, exportsDir, psql, timestamp } from "./vault-runtime.mjs";
import "./write-vault-manifest.mjs";

ensureVaultDirectories();
const output = path.join(exportsDir, `Canvas-Vault-Portable-${timestamp()}`);
mkdirSync(output, { recursive: true });
const db = new DatabaseSync(path.join(output, "vault.sqlite"));
db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE folders (id TEXT PRIMARY KEY, parent_id TEXT, name TEXT NOT NULL, sort_order INTEGER, trashed_at TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE boards (id TEXT PRIMARY KEY, folder_id TEXT, name TEXT NOT NULL, sort_order INTEGER, trashed_at TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE content_items (id TEXT PRIMARY KEY, board_id TEXT, source_type TEXT, canonical_url TEXT, external_id TEXT, title TEXT, author TEXT, description TEXT, content_text TEXT, transcript_text TEXT, transcript_status TEXT, transcript_origin TEXT, transcript_language TEXT, transcript_error TEXT, thumbnail_url TEXT, published_at TEXT, duration_seconds INTEGER, view_count INTEGER, mime_type TEXT, file_name TEXT, file_size INTEGER, relative_item_dir TEXT, trashed_at TEXT, metadata_json TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, board_id TEXT, title TEXT, scope_type TEXT, source_item_ids_json TEXT, trashed_at TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE chat_messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at TEXT);
  CREATE TABLE search_documents (item_id TEXT PRIMARY KEY, title TEXT, author TEXT, content TEXT, transcript TEXT);
  CREATE INDEX search_title_idx ON search_documents(title);
`);
const tables = {
  folders: JSON.parse(psql("SELECT COALESCE(json_agg(t),'[]'::json)::text FROM (SELECT * FROM folders ORDER BY created_at) t;")),
  boards: JSON.parse(psql("SELECT COALESCE(json_agg(t),'[]'::json)::text FROM (SELECT * FROM boards ORDER BY created_at) t;")),
  items: JSON.parse(psql("SELECT COALESCE(json_agg(t),'[]'::json)::text FROM (SELECT id,board_id,source_type,canonical_url,external_id,title,author,description,content_text,transcript_text,transcript_status,transcript_origin,transcript_language,transcript_error,thumbnail_url,published_at,duration_seconds,view_count,mime_type,file_name,file_size,trashed_at,metadata,created_at,updated_at FROM content_items ORDER BY created_at) t;")),
  chats: JSON.parse(psql("SELECT COALESCE(json_agg(t),'[]'::json)::text FROM (SELECT * FROM chat_sessions ORDER BY created_at) t;")),
  messages: JSON.parse(psql("SELECT COALESCE(json_agg(t),'[]'::json)::text FROM (SELECT * FROM chat_messages ORDER BY created_at) t;")),
};
const insertFolder = db.prepare("INSERT INTO folders VALUES (?,?,?,?,?,?,?)");
const insertBoard = db.prepare("INSERT INTO boards VALUES (?,?,?,?,?,?,?)");
const insertItem = db.prepare(`INSERT INTO content_items VALUES (${Array(26).fill("?").join(",")})`);
const insertSearch = db.prepare("INSERT INTO search_documents VALUES (?,?,?,?,?)");
const insertChat = db.prepare("INSERT INTO chat_sessions VALUES (?,?,?,?,?,?,?,?)");
const insertMessage = db.prepare("INSERT INTO chat_messages VALUES (?,?,?,?,?)");
db.exec("BEGIN");
for (const row of tables.folders) insertFolder.run(row.id,row.parent_id,row.name,row.sort_order,row.trashed_at,row.created_at,row.updated_at);
for (const row of tables.boards) insertBoard.run(row.id,row.folder_id,row.name,row.sort_order,row.trashed_at,row.created_at,row.updated_at);
for (const row of tables.items) {
  insertItem.run(row.id,row.board_id,row.source_type,row.canonical_url,row.external_id,row.title,row.author,row.description,row.content_text,row.transcript_text,row.transcript_status,row.transcript_origin,row.transcript_language,row.transcript_error,row.thumbnail_url,row.published_at,row.duration_seconds,row.view_count,row.mime_type,row.file_name,row.file_size,row.id,row.trashed_at,JSON.stringify(row.metadata||{}),row.created_at,row.updated_at);
  insertSearch.run(row.id,row.title,row.author,row.content_text,row.transcript_text);
}
for (const row of tables.chats) insertChat.run(row.id,row.board_id,row.title,row.scope_type,JSON.stringify(row.source_item_ids||[]),row.trashed_at,row.created_at,row.updated_at);
for (const row of tables.messages) insertMessage.run(row.id,row.session_id,row.role,row.content,row.created_at);
db.exec("COMMIT; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;"); db.close();
rmSync(path.join(output, "vault.sqlite-wal"), { force: true });
rmSync(path.join(output, "vault.sqlite-shm"), { force: true });
if (process.env.VAULT_EXPORT_WITH_FILES === "1") cpSync(path.join(dataRoot, "vault"), path.join(output, "files"), { recursive: true });
const manifest = { format: "com.osirismedici.canvas-vault.portable", formatVersion: 1, createdAt: new Date().toISOString(), metadata: "vault.sqlite", filesIncluded: process.env.VAULT_EXPORT_WITH_FILES === "1", counts: { folders: tables.folders.length, boards: tables.boards.length, items: tables.items.length, chats: tables.chats.length, messages: tables.messages.length } };
writeFileSync(path.join(output, "vault-manifest.json"), `${JSON.stringify(manifest,null,2)}\n`);
process.stdout.write(`${output}\n`);
