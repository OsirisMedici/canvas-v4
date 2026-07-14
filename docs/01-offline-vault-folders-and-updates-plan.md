# Osiris Vault: Offline Folders, Portable Data, and Safe Updates

Status: Phases 1–5 implemented for the Apple Silicon release; Apple notarization awaits account credentials  
Owner: Osiris  
Implementation workspace: the local Canvas v4 source checkout  
Installed application: `/Applications/Osiris Vault.app`  

## 1. Outcome

Osiris Vault should become a private, offline-first desktop application that can be updated without replacing, moving, or deleting a person's saved work.

The finished product has four independent layers:

1. **Replaceable application** — the signed Electron and Next.js application.
2. **Permanent vault** — database, original files, previews, transcripts, and folder structure.
3. **Optional native runtime** — media and transcription tools bundled or managed by the installer.
4. **Optional update service** — checks for a new signed release but never receives vault content.

The application is disposable. The vault is permanent.

## 2. Product principles

- Normal vault use works without internet.
- Updates never include or overwrite user data.
- The user can open an existing vault after reinstalling the application.
- A folder may contain boards and other folders.
- A board contains sources, chats, and source selections.
- Two-finger click or Control-click opens a context menu on macOS.
- Double-click opens a folder. It never deletes data.
- Delete means **Move to Trash** first.
- Permanent deletion always requires a clear confirmation.
- Schema changes are additive, versioned, backed up, and reversible when practical.
- Remote content is copied or extracted locally when the user chooses to save it.
- No authenticated browser session or cookies are scraped from private services.

## 3. Current state

The current personal release already provides:

- Electron control screen and managed local runtime.
- Next.js standalone server bound to `127.0.0.1:3217`.
- PostgreSQL 16 at `127.0.0.1:5447`.
- External data directory selected by the user; new installations default to `~/Documents/Osiris Vault`.
- Boards, local files, previews, transcripts, chats, and Codex-assisted chat.
- Nested folders containing boards and subfolders.
- Two-finger/Control-click and visible action menus for rename, move, and Trash.
- Safe application replacement: the `.app` bundle contains no vault data.
- Clipboard and drag/drop ingestion for supported content.

Current limitations:

- Board records are database entities, not literal Finder folders.
- Portable exports use SQLite as an interchange database; the live app still uses its local PostgreSQL runtime.
- Private ChatGPT conversation URLs cannot be read without authentication.
- Codex chat requires each teammate's own Codex installation/login.
- Whisper is an optional installable module because its runtime and models are large.
- The current release is ad-hoc signed. Developer ID signing and notarization require Osiris's Apple Developer credentials.

## 4. Target vault model

### 4.1 Logical hierarchy

```text
Vault
├── Folder
│   ├── Folder
│   │   ├── Board
│   │   └── Board
│   └── Board
├── Board
└── Trash
```

Folders organize boards. Sources remain owned by one board in the MVP. Cross-board references can be introduced later without duplicating the original file.

### 4.2 Physical storage

For the current PostgreSQL release:

```text
data/
├── postgres/             # local PostgreSQL cluster
├── vault/                # immutable item directories keyed by item UUID
├── models/               # local transcription models
├── chats/                # temporary local agent output
├── vault-manifest.json   # format/version/path metadata
└── backups/              # database dumps and manifest snapshots
```

Board and folder names must not be used directly as physical paths. UUID paths avoid broken links when a board is renamed or moved and avoid unsafe filenames. The human hierarchy lives in the database and export manifest.

### 4.3 Portable team format

The team-distribution milestone should migrate metadata to a single embedded database file:

```text
Osiris Vault/
├── vault.sqlite
├── vault-manifest.json
├── files/
├── previews/
└── backups/
```

SQLite is the recommended team runtime because it removes the requirement to install and manage PostgreSQL on every teammate's Mac. The personal PostgreSQL vault remains supported until export/import has been verified.

## 5. Database evolution

### 5.1 Phase 1 additive schema

Add `folders`:

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | UUID | Stable folder identity |
| `parent_id` | UUID nullable | Self-reference for nesting |
| `name` | text | User-visible name |
| `sort_order` | integer | Stable sidebar ordering |
| `trashed_at` | timestamptz nullable | Soft deletion |
| `created_at` | timestamptz | Audit time |
| `updated_at` | timestamptz | Audit time |

Extend `boards`:

- `folder_id uuid null references folders(id) on delete set null`
- `sort_order integer not null default 0`
- `trashed_at timestamptz null`

Extend `content_items` and `chat_sessions` with `trashed_at` only when item/chat Trash is implemented. Phase 1 board Trash keeps all child records intact through the board relationship.

### 5.2 Invariants

- A folder cannot be its own parent.
- Moving a folder cannot create a cycle.
- The root is represented by `parent_id IS NULL`; no synthetic root row is needed.
- Trashing a folder trashes its descendant folders and boards in one transaction.
- Restoring a folder restores the hierarchy when its former parent exists; otherwise it restores at root.
- The default `My Library` board cannot be permanently deleted while it is the only active board.
- Existing boards migrate to root and remain visible without user action.

### 5.3 Schema versioning

Create `vault_schema_migrations(version, name, applied_at)`. Each application release runs pending migrations in order.

Before a destructive or non-reversible migration:

1. Stop new writes.
2. Create a database backup.
3. Write a manifest snapshot.
4. Apply the migration in a transaction.
5. Run integrity checks.
6. Start the UI only after health passes.

## 6. API design

### Folders

- `GET /api/folders` — active nested folder rows plus board counts.
- `POST /api/folders` — create a root folder or subfolder.
- `PATCH /api/folders/[id]` — rename, move, reorder, restore.
- `DELETE /api/folders/[id]` — move folder subtree and contained boards to Trash.

### Boards

- `POST /api/boards` — accept optional `folderId`.
- `PATCH /api/boards/[id]` — rename, move, reorder, restore.
- `DELETE /api/boards/[id]` — move board to Trash; do not cascade-delete sources.

### Trash

- `GET /api/trash` — trashed folders and boards.
- `POST /api/trash/restore` — restore selected entities.
- `DELETE /api/trash/[type]/[id]` — permanently delete after explicit confirmation.
- `DELETE /api/trash` — empty Trash after explicit confirmation.

All mutation endpoints validate UUIDs and names, reject folder cycles, and execute hierarchy changes transactionally.

## 7. Sidebar interaction specification

### 7.1 Creation

The Boards section receives a `+` menu:

- New board
- New folder

When a folder is open or selected, creation defaults to that folder. The creation dialog allows changing the destination.

### 7.2 Navigation

- Single-click folder: select it and expose its actions.
- Double-click folder: expand/collapse it.
- Single-click board: open it.
- Disclosure chevron: expand/collapse without changing selection.
- Expanded folder IDs persist locally per vault.

### 7.3 Context menus

Two-finger click, Control-click, or `•••` opens the same menu.

Folder actions:

- New board inside
- New subfolder
- Rename
- Move
- Move to Trash

Board actions:

- Open
- Rename
- Move to folder
- Move to Trash

Context menus close on Escape, outside click, navigation, or completed action. They remain inside the viewport and are keyboard accessible.

### 7.4 Deletion safety

The first delete action says `Move to Trash`, not `Delete`. The confirmation identifies the number of boards and sources affected. Permanent deletion is available only inside the Trash view.

## 8. Content ingestion expansion

### 8.1 Direct PDF URLs

When a pasted URL is ingested:

1. Normalize and validate the URL.
2. Make a bounded request and inspect redirect destination and `Content-Type`.
3. If it is PDF, download it to a new UUID item directory.
4. Enforce size and timeout limits.
5. Extract text locally.
6. Render page one as the card preview.
7. Preserve original URL and response metadata.

Do not trust only the `.pdf` suffix; verify MIME type or PDF signature.

### 8.2 General webpages

Store:

- canonical URL
- title
- author or publisher
- description
- readable article text
- Open Graph image when available
- capture timestamp

If extraction fails, still save a source card containing URL, host, title, and failure reason so the user does not lose the reference.

### 8.3 ChatGPT content

- Public `/share/` pages: ingest as a normal public webpage when accessible.
- Private conversation URLs: show a clear explanation that authentication prevents local ingestion.
- Pasted conversation text: save as a note.
- Exported `.html`, `.md`, `.txt`, or `.json`: import as a document/note.

The application must not extract Chrome cookies or reuse private session credentials.

## 9. Portable vault and updates

### 9.1 Vault selection

The desktop control screen will eventually expose:

- Create new vault
- Open existing vault
- Reveal current vault
- Back up vault

`runtime.json` stores only the selected vault path and runtime preferences. It contains no user content.

### 9.2 Update boundary

An application update may replace only:

```text
/Applications/Osiris Vault.app
```

It may never replace:

- selected vault directory
- database or database backup
- source files
- previews
- transcripts
- models
- logs
- runtime settings

### 9.3 Release pipeline

Team distribution requires:

1. Versioned release build.
2. Apple Silicon build first; universal/Intel when needed.
3. Bundled or embedded native dependencies.
4. Developer ID signing with hardened runtime.
5. Apple notarization and stapling.
6. Signed release archive and checksums.
7. Update manifest/feed.
8. Staged rollout and rollback release.

The current ad-hoc signed build remains the personal development channel.

### 9.4 Update experience

- Check on launch and once every 24 hours while running.
- Show release version, notes, size, and backup status.
- Download only after the user accepts, unless automatic download is enabled.
- Verify signature and checksum.
- Stop managed runtime cleanly.
- Install and relaunch.
- Back up before applying schema migrations.
- If migration health fails, restore backup and show repair guidance.

## 10. Offline reminders and notifications

Local notifications can cover:

- update downloaded and ready
- backup overdue
- transcription completed or failed
- import completed
- scheduled personal reminder

Rules:

- Vault content is never transmitted to the update service.
- The app works normally when update checks fail.
- Remote update announcements require internet.
- Fully offline installations use manually imported signed update files.
- Notifications while the app is not running require a small signed background helper or LaunchAgent; this is not part of Phase 1.

## 11. Implementation phases

### Phase 1 — Folder tree and safe management

Deliverables:

- additive folder/board schema
- nested folder sidebar
- create folder and create board inside folder
- rename and move APIs
- Mac context menus plus visible `•••` fallback
- board/folder Move to Trash
- existing boards preserved at root

Exit criteria:

- existing board and item counts unchanged after migration
- three-level folder nesting works
- cycle moves are rejected
- two-finger click opens the correct context menu
- double-click expands folders and never deletes
- trashed board content remains present in database and on disk

### Phase 2 — Trash and ingestion expansion

Deliverables:

- Trash view, restore, and permanent deletion
- direct PDF URL detection/download/preview/text
- robust general URL capture and failure cards
- ChatGPT public-share and pasted/exported content handling
- ingestion observability and repair messages

### Phase 3 — Portable vault foundation

Deliverables:

- vault manifest and schema version
- Create/Open Existing Vault control flow
- backup and integrity commands
- PostgreSQL export package
- SQLite metadata prototype and verified migration report

### Phase 4 — Team-ready application

Deliverables:

- embedded database runtime
- packaged media/PDF tools
- packaged transcription strategy or optional module installer
- first-run setup with no Terminal requirements
- separate user vaults and no shared credentials

### Phase 5 — Signed distribution and updates

Deliverables:

- Developer ID signing and hardened runtime
- notarized DMG/ZIP
- update feed and signed checksums
- in-app update state and native notifications
- staged release, rollback, and support documentation

## 12. QA matrix

### Data preservation

- Record board, item, chat, and file counts before every migration.
- Build and reinstall the application.
- Verify counts and representative hashes after reinstall.
- Verify the application bundle contains no vault data.

### Hierarchy

- Create root folder, nested folder, and boards at each level.
- Rename without changing IDs or file paths.
- Move boards between root and nested folders.
- Move nested folders and reject cycles.
- Restart and confirm expansion state and hierarchy.

### Trash

- Trash a board and confirm it disappears from active navigation.
- Confirm its items, chats, and media remain present.
- Restore it to the original folder.
- Trash a folder subtree and restore it.
- Permanently delete only after confirmation and backup verification.

### Ingestion

- Paste normal webpage, direct PDF URL, public ChatGPT share, and plain text.
- Upload PDF, image, video, text, HTML, Markdown, and JSON.
- Confirm preview, extracted text, playback seeking, and transcript status.
- Test redirects, large files, malformed URLs, and offline failures.

### Desktop lifecycle

- Start, Stop, red-window close, immediate restart, and Command+Q.
- Existing external server and unknown port conflict.
- Missing dependency repair messages.
- Reinstall with the vault closed and open.

### Updates

- Same-version no-op.
- Upgrade with no schema change.
- Upgrade with additive schema change.
- Simulated migration failure and automatic backup restore.
- Invalid signature and checksum rejection.
- Offline update check failure without blocking vault use.

## 13. Rollback

Each release retains:

- previous signed application release
- pre-migration database backup
- previous manifest snapshot
- migration log

Rollback procedure:

1. Stop the application-managed server and database.
2. Preserve the failed database and logs for diagnosis.
3. Restore the pre-migration backup only if schema changed.
4. Replace the `.app` with the previous signed release.
5. Start and run health/integrity checks.
6. Never delete original source files during rollback.

## 14. Phase 1 implementation record

Implemented and installed on 2026-07-14:

- Additive schema versions `1,2`; existing boards remain at root.
- `folders` hierarchy plus backward-compatible board folder/order/Trash metadata.
- Folder and board create, rename, move, cycle prevention, and soft-delete APIs.
- Recursive sidebar with saved expansion state.
- New board/folder menu, visible `…` buttons, two-finger/Control-click menus, and Escape/outside-click dismissal.
- Safe Move to Trash for boards and folder subtrees; source rows and media stay untouched.
- Packaged and ad-hoc signed Apple Silicon application reinstalled at `/Applications/Osiris Vault.app`.

Verification record:

- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run desktop:build` passed.
- Packaged API fixture passed root folder, subfolder, board creation, rename, move, and subtree Trash; the fixture was removed afterward.
- Post-QA database: 3 active boards, 0 user folders, 69 sources, 2 chats, 4 messages.
- External data directory remains 2.7 GB and the installed application has no vault database directory.
- Installed health endpoint reports `app: Osiris Vault`, `managedBy: electron`, connected database, and the expected external data path.
- Installed UI exposes New board/New folder and board context menu actions Rename, Move to folder, and Move to Trash.

The original roadmap below is retained as the design record; the completion record documents the implemented result.

## 15. Phases 2–5 completion record

Implemented in version `0.5.0` on 2026-07-14:

### Phase 2

- Trash view for folders, boards, and individual sources.
- Soft deletion, restore, explicit permanent deletion, and Empty Trash.
- Direct PDF URL download with signature validation, local text extraction, and first-page preview.
- General webpage failure cards so inaccessible links remain saved.
- Clear private ChatGPT guidance plus support for pasted text and exported HTML, Markdown, text, JSON, and CSV files.
- URL ingestion job history with completion, byte, and error status.

### Phase 3

- Versioned `vault-manifest.json` outside the application.
- Compressed PostgreSQL backups, manifest snapshots, SHA-256 receipts, and ten-backup retention.
- Integrity reports covering orphan rows and folder cycles.
- Portable SQLite export preserving folders, boards, sources, transcripts, chats, and messages.
- Optional full media copy and automatic portable import when a selected folder contains `vault.sqlite`.
- Desktop **Choose vault folder** workflow.

### Phase 4

- Embedded Apple Silicon PostgreSQL 16, FFmpeg, FFprobe, Poppler tools, and rewritten non-system dynamic libraries.
- Verified embedded binaries independently of Homebrew paths.
- Optional in-app faster-whisper module installer.
- Per-user external vault folder and first-run initialization without `npm` commands.

### Phase 5

- Version `0.5.0` release packaging, ZIP, SHA-256 checksum, and update manifest.
- Launch and 24-hour update checks with offline-safe failure behavior.
- Backup-overdue and completed-operation native notifications.
- Developer ID/hardened-runtime/notarization pipeline activated when Apple credentials are supplied by environment variables.
- Release and rollback documentation in `docs/02-team-distribution-and-updates.md`.

QA evidence:

- Type-check, lint, Next.js production build, Electron build, and release packaging passed.
- Trash → restore → Trash → permanent delete passed for a fixture source and folder tree.
- Direct linked-PDF capture stored the PDF, extracted text, and generated a preview.
- Public-page failure card and private ChatGPT guidance passed.
- Portable export/import round trip reproduced 3 boards, 68 sources, 2 chats, and 4 messages in an isolated test database.
- Embedded PostgreSQL, FFmpeg, and Poppler executables launched successfully from the packaged runtime.
- Release checksum verification passed for `Osiris-Vault-0.5.0-arm64.zip`.

External distribution has one credential-only gate: run `npm run desktop:release` with the Apple signing/notarization environment variables documented in `docs/02-team-distribution-and-updates.md`.
