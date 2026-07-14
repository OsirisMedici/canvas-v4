# Canvas Vault 4.1.0

Canvas v4 is now shipped as **Canvas Vault**: a focused, local-first content library that works alongside Codex without embedding bots or chat modes inside the application.

## Install with Codex

The repository README now includes a one-click **Open the installer in Codex** link and a complete copyable installation prompt. The new `npm run setup` command installs required local tools, installs exact JavaScript dependencies, builds and installs the desktop application, opens it, and verifies the database-backed localhost runtime.

See [INSTALLATION.md](INSTALLATION.md) for the complete team installation flow.

## Product changes

- Renamed all user-facing application surfaces to **Canvas Vault**.
- Removed the in-app bot and chat experience.
- Added **Use with Codex** and a generated `~/Documents/Canvas Workspace` folder.
- Added a controllable sidebar with hide and show controls.
- Added single-step undo for recent destructive organization actions.
- Added double-click and action-menu deletion for board components.
- Added real YouTube titles, channel and view details, duration badges, and source-aware landscape or portrait thumbnail layouts.
- Kept Trash and restore workflows local and recoverable.
- Preserved existing private libraries and earlier runtime settings during upgrades.

## Distribution

- Application: `Canvas Vault.app`
- Architecture: Apple Silicon (`arm64`)
- Local address: `http://127.0.0.1:3217`
- Codex workspace: `~/Documents/Canvas Workspace`
- New-install private data: `~/Library/Application Support/Canvas Vault`

This community build is ad-hoc signed rather than Apple-notarized. The Codex installation flow builds locally and clears the local quarantine attribute as part of installation.
