# Canvas v4 — Osiris Vault

Canvas v4 is a private, offline-first research and media vault for macOS. Save boards, nested folders, notes, images, videos, PDFs, webpages, and YouTube sources in one local workspace. The installed desktop application is named **Osiris Vault**.

Your source files, database, transcripts, previews, chats, backups, and exports stay on your Mac. No cloud account or hosted database is required. The application binds only to `127.0.0.1`.

## Download for macOS

Download the latest Apple Silicon release from the [GitHub Releases page](https://github.com/OsirisMedici/canvas-v4/releases/latest), unzip it, and move `Osiris Vault.app` to `/Applications`.

The current community build is ad-hoc signed rather than Apple-notarized. On first launch, macOS may require you to Control-click the app, choose **Open**, and confirm. You can also remove the downloaded quarantine attribute:

```bash
xattr -dr com.apple.quarantine "/Applications/Osiris Vault.app"
```

Open the app and press **Start Osiris Vault**. On a new Mac, the default external workspace is created at:

```text
~/Documents/Osiris Vault/
├── postgres/  # dedicated PostgreSQL cluster
├── models/    # optional local Whisper model cache
└── vault/     # files, source snapshots, extracted text, and transcripts
```

Use **Osiris Vault → Choose Vault Folder** to keep the workspace somewhere else. Replacing or removing the `.app` does not delete this external folder.

## Everyday workflow

- Copy a link, image, PDF, video, file, or text and press `Command+V` on a board.
- Drop files directly onto the board.
- Open a source in the right pane without leaving the board.
- Select sources and click **Chat**, or chat with the complete board.
- Create nested folders and multiple boards.
- Two-finger/Control-click folders and boards to rename, move, or send them to Trash.
- Restore entries from Trash or permanently delete them after confirmation.
- Capture direct PDF URLs and store their text and first-page preview locally.

## Backups, portability, and updates

The application menu includes:

- **Choose Vault Folder**
- **Back Up Vault**
- **Check Vault Integrity**
- **Export Portable Vault**
- **Install Transcription Module**
- **Check for Updates**

A portable export contains a SQLite interchange database and a copy of the vault media. Selecting that portable folder on another Apple Silicon Mac recreates its hierarchy and sources. Application updates replace only `Osiris Vault.app`.

See [Team distribution and updates](docs/02-team-distribution-and-updates.md) for the release, signing, backup, update-feed, and rollback model.

## Optional local tools

PostgreSQL 16, FFmpeg, and Poppler are bundled in the desktop release. These optional capabilities use tools installed for the current macOS user:

- YouTube caption fallback: `yt-dlp`
- Local audio transcription: install from **Osiris Vault → Install Transcription Module**
- Board chat: authenticated [Codex CLI](https://github.com/openai/codex)

Ingestion, local storage, previews, caption fetching, and Whisper transcription do not call an LLM. Codex is used only when the user starts an agent chat.

## Development

Requirements: Node.js, npm, and an Apple Silicon Mac for the packaged desktop build.

```bash
npm install
npm run db:start
npm run db:schema
npm run dev
```

Quality and desktop workflows:

```bash
npm run check
npm run desktop:build
npm run desktop:release
```

Development data is ignored by Git and remains outside published releases. Copy `.env.example` to `.env.local` only when local overrides are needed.

## Privacy and support boundary

- No login or public network listener is included.
- Every user owns their local workspace and database.
- Releases never contain the maintainer's vault, database, logs, environment files, or credentials.
- The first public binary targets Apple Silicon macOS only.

## License

Canvas v4 source code is available under the [MIT License](LICENSE).
