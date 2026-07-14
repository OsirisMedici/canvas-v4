# Canvas Vault storage and update architecture

## Naming boundary

Canvas Vault uses three deliberately separate locations:

1. `/Applications/Canvas Vault.app` — the replaceable application.
2. `~/Documents/Canvas Workspace` — the user-facing folder opened in Codex.
3. `~/Library/Application Support/Canvas Vault` — private runtime settings and, for a new installation, private library data.

The source repository remains Canvas v4. Opening the repository in Codex is application development. Opening Canvas Workspace in Codex is normal Canvas Vault use and does not change the app's interface.

## Data guarantees

- Updates replace only the application bundle.
- Original files, previews, transcripts, backups, and database data stay outside the bundle.
- Existing installations keep their selected private data path.
- Canvas Workspace source notes can be regenerated, while each board's `Outputs/` folder is preserved.
- The local server binds to `127.0.0.1` only.

## Legacy migration

On first launch under the Canvas Vault name, the desktop runtime checks for runtime configurations from earlier releases. If found, it copies those settings into `~/Library/Application Support/Canvas Vault/runtime.json` and continues to use the same private data path. The previous configuration and application are not deleted automatically.

The default Canvas Workspace is `~/Documents/Canvas Workspace`. A previously generated workspace nested inside the private data folder is moved there only when the new workspace does not already exist.

## Portable data and recovery

Canvas Vault retains the existing backup, integrity-check, portable export, and portable import formats for backward compatibility. Internal database and format identifiers may still contain legacy compatibility names; they are not user-facing product names.

Recovery order:

1. Stop Canvas Vault.
2. Preserve the current private data directory.
3. Replace or roll back only `Canvas Vault.app`.
4. Restore a database backup only if a verified schema migration requires it.

## Release verification

Before distribution:

- Run `npm run check`.
- Build and ad-hoc sign `Canvas Vault.app`.
- Confirm the app opens automatically into the library.
- Confirm `/api/health` reports `app: Canvas Vault` and a connected database.
- Confirm **Use with Codex** creates or refreshes `~/Documents/Canvas Workspace`.
- Confirm existing `Outputs/` content survives a workspace refresh.
- Confirm the application bundle contains no user library data.
