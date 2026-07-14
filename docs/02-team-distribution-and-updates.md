# Canvas Vault distribution and updates

## Release artifact

The Apple Silicon release is `Canvas-Vault-<version>-arm64.zip`, containing `Canvas Vault.app`. The app bundle includes the local Next.js server and native runtime tools. Optional local transcription models remain outside the bundle.

## Install

1. Move `Canvas Vault.app` to `/Applications`.
2. Open it. Canvas Vault starts its local runtime automatically.
3. Paste or drop material into boards.
4. Choose **Use with Codex** when you want to work with the material in Codex.

The default Codex-facing folder is `~/Documents/Canvas Workspace`.

## Updates

An update replaces only `/Applications/Canvas Vault.app`. It does not replace:

- the private database and media;
- Canvas Workspace or board outputs;
- backups and portable exports;
- runtime settings and logs;
- local transcription modules or models.

Update feed settings are stored in:

```text
~/Library/Application Support/Canvas Vault/runtime.json
```

Canvas Vault checks at launch and once every 24 hours when a feed is configured. A failed check never blocks offline use.

## Backup and rollback

Before a release, use **Back Up Library** and **Check Library Integrity**. Keep the previous signed application ZIP and the latest verified database dump. To roll back, stop Canvas Vault and replace only the application. Restore database data only when necessary.

## Legacy users

The first Canvas Vault launch imports runtime settings from earlier releases without moving or deleting existing private data. The earlier app bundle and support folder remain untouched until the user chooses to remove them.
