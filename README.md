# Canvas Vault

Canvas Vault is a private, local-first content library for macOS. It stores boards, folders, notes, images, videos, PDFs, webpages, and YouTube sources. It does not contain bots or an in-app chat mode.

## Install

[![Install Canvas Vault with Codex](assets/install-with-codex.svg)](https://osirismedici.github.io/canvas-v4/install.html)

[**Read or copy the full installation prompt**](INSTALLATION.md)

Open the installation page, click **Open the Canvas Vault installer in Codex**, or copy its complete installation prompt into Codex. Codex will install the repository, build the desktop application, open it, and verify that the setup is healthy.

Prefer a packaged build? [Download the latest Apple Silicon release](https://github.com/OsirisMedici/canvas-v4/releases/latest). The Codex installer remains the easiest path because it can install dependencies and verify the running application automatically.

Already inside the repository? Run:

```bash
npm run setup
```

## How the names work

- **Canvas Vault** is the installed application.
- **Canvas v4** is this source-code repository and major version.
- **Canvas Workspace** is the human-readable folder you open in Codex: `~/Documents/Canvas Workspace`.
- **Private app data** contains the database, media, previews, transcripts, backups, and runtime files. New installs keep it under `~/Library/Application Support/Canvas Vault`; existing installations retain their current data folder automatically.

Opening Canvas Workspace in Codex lets Codex use the library files. It does not modify the Canvas Vault interface. Opening this source repository in Codex is development work and can change the application.

## Install and use

The macOS application is `/Applications/Canvas Vault.app`. It starts its local runtime automatically and binds only to `127.0.0.1`.

Inside the app:

- Paste or drop sources into a board.
- Organize sources with folders and boards.
- Open **Use with Codex** to refresh and locate Canvas Workspace.
- In Codex, open `~/Documents/Canvas Workspace`, choose a board, and save new work inside that board's `Outputs/` folder.

Canvas Workspace contains generated Markdown source notes plus preserved output folders. Canvas Vault refreshes generated source notes but does not overwrite the work inside `Outputs/`.

## Backups and portability

The **Canvas Vault** application menu includes:

- **Open Canvas Workspace**
- **Back Up Library**
- **Check Library Integrity**
- **Export Portable Library**
- **Install Transcription Module**
- **Check for Updates**

Replacing `Canvas Vault.app` does not replace the library, Canvas Workspace, or private app data. See [Team distribution and updates](docs/02-team-distribution-and-updates.md) for the release and rollback model.

## Development

Requirements: Node.js, npm, and an Apple Silicon Mac for the packaged desktop build.

```bash
npm install
npm run db:start
npm run db:schema
npm run dev
```

```bash
npm run check
npm run desktop:build
npm run desktop:install
npm run desktop:release
```

Development data is ignored by Git. Copy `.env.example` to `.env.local` only when local overrides are needed.

## Privacy

- No login or public network listener is included.
- Files, database content, previews, and transcripts remain on the Mac.
- Ingestion and transcription do not call an LLM.
- Codex is used separately by opening Canvas Workspace.

## License

Canvas Vault source code is available under the [MIT License](LICENSE).
