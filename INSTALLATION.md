# Install Canvas Vault

Canvas Vault is a private, local-first macOS application. The installer builds the open-source repository, installs the desktop application, starts its private local runtime, and verifies that it is working.

## Install with Codex

[![Install Canvas Vault with Codex](assets/install-with-codex.svg)](codex://new?prompt=Install%20Canvas%20Vault%20from%20https%3A%2F%2Fgithub.com%2FOsirisMedici%2Fcanvas-v4.%20If%20the%20repository%20is%20not%20already%20open%2C%20clone%20it%20into%20~%2FCanvas%20Vault%20Source%20and%20work%20there.%20Read%20AGENTS.md%20and%20INSTALLATION.md%2C%20run%20the%20documented%20one-command%20setup%2C%20resolve%20safe%20dependency%20issues%2C%20verify%20%2FApplications%2FCanvas%20Vault.app%20and%20http%3A%2F%2F127.0.0.1%3A3217%2Fapi%2Fhealth%2C%20then%20leave%20the%20application%20running.%20Preserve%20all%20existing%20library%20data%20from%20earlier%20versions.)

The button opens a new Codex task with the installation request filled in. Review it and press **Send**. If the button does not open Codex, copy the complete prompt below and paste it into a new Codex task.

```text
Install Canvas Vault completely and leave the application running.

Repository: https://github.com/OsirisMedici/canvas-v4
Supported system: an Apple Silicon Mac (M1 or newer)

Please do the following work autonomously:

1. If the current Codex project is already the canvas-v4 repository, use it. Otherwise clone the repository into ~/Canvas Vault Source and work from that folder. If that destination already exists, inspect it safely and do not overwrite unrelated or uncommitted work.
2. Read AGENTS.md and INSTALLATION.md before changing or running anything.
3. Confirm that this is macOS on Apple Silicon and that Git, Node.js, npm, and Homebrew are available.
4. If Homebrew is missing, install it using the official installer from https://brew.sh. If Node.js is missing, install the current Homebrew Node.js package.
5. Run npm run setup from the repository root. This command must install the required local tools, install exact JavaScript dependencies, build Canvas Vault, copy Canvas Vault.app into /Applications, open it, and verify its local runtime.
6. Resolve safe setup problems that are clearly within this repository or its documented dependencies. Do not delete or reset any existing application data.
7. Preserve all existing library data and runtime settings from earlier versions. An application update must replace only the application bundle.
8. Verify all of these results:
   - /Applications/Canvas Vault.app exists.
   - http://127.0.0.1:3217/api/health returns ok: true and app: Canvas Vault.
   - The health response reports a connected database.
   - The Canvas Workspace directory reported by the health endpoint exists.
   - The Canvas Vault window opens successfully.
9. Leave Canvas Vault running and report the application path, local address, Canvas Workspace path, and private data path.

Do not stop after installing packages or completing a build. The task is complete only when the installed desktop application is open and its health endpoint has been verified.
```

Codex may ask for approval when macOS needs permission to install system software or write to `/Applications`. Approve only the clearly described Canvas Vault installation action.

## What the setup command does

From the repository root, Codex runs:

```bash
npm run setup
```

That command:

1. Checks for an Apple Silicon Mac and Homebrew.
2. Installs PostgreSQL 16, FFmpeg, and Poppler when missing, plus yt-dlp when no existing installation is available.
3. Runs `npm ci` so dependencies match `package-lock.json`.
4. Builds and ad-hoc signs the macOS desktop application.
5. Installs and opens `/Applications/Canvas Vault.app`.
6. Waits for `http://127.0.0.1:3217/api/health` to report a healthy database-backed runtime.

The application binds only to `127.0.0.1`; it is not exposed to the public internet.

## Manual fallback

Requirements:

- macOS on Apple Silicon;
- Git;
- [Homebrew](https://brew.sh);
- Node.js and npm.

```bash
git clone https://github.com/OsirisMedici/canvas-v4.git "$HOME/Canvas Vault Source"
cd "$HOME/Canvas Vault Source"
npm run setup
```

If `node` is unavailable, run `brew install node` first. If Homebrew is unavailable, install it from [brew.sh](https://brew.sh), reopen Terminal, and run the commands again.

## Verify the installation

```bash
open -a "Canvas Vault"
curl --fail --silent http://127.0.0.1:3217/api/health
```

A successful response contains `"ok":true`, `"app":"Canvas Vault"`, and `"status":"connected"`.

## Data safety and updates

The application bundle, working material, and private runtime data are deliberately separate:

- Application: `/Applications/Canvas Vault.app`
- Codex-facing material: `~/Documents/Canvas Workspace`
- New-install private data: `~/Library/Application Support/Canvas Vault`

Reinstalling or updating the application replaces only `/Applications/Canvas Vault.app`. It does not replace the database, media, transcripts, Canvas Workspace, backups, or outputs. Settings from earlier releases are detected and carried forward without deleting the previous data.

## Troubleshooting

- **Homebrew was not found:** install it from [brew.sh](https://brew.sh), then run `npm run setup` again.
- **Only Intel is available:** the packaged desktop build currently supports Apple Silicon only.
- **Port 3217 is already in use:** close the conflicting local process, then reopen Canvas Vault.
- **macOS blocks the app:** in **System Settings → Privacy & Security**, confirm that you want to open the locally built Canvas Vault application.
- **The app does not become healthy:** open the application and use **Canvas Vault → Open Logs**, then give the log output to Codex.
