# Canvas v4 — Osiris Vault Team Distribution and Updates

## Release boundary

Every release replaces only `Osiris Vault.app`. A teammate's selected vault folder, database, media, previews, transcripts, backups, exports, logs, and runtime preferences stay outside the application bundle.

## Build channels

- `local-adhoc`: personal testing on this Mac.
- `developer-id`: signed with an Apple Developer ID certificate.
- `notarized`: Developer ID signed, submitted to Apple, accepted, and stapled.

Run `npm run desktop:release`. Without Apple credentials it creates a locally signed ZIP, checksum, and `release.json`. For external distribution provide these environment variables:

```text
APPLE_SIGNING_IDENTITY
APPLE_ID
APPLE_TEAM_ID
APPLE_APP_PASSWORD
```

Credentials are read only from the environment and are never written into the repository or application.

## Update feed

Host the generated `release.json` and ZIP over HTTPS, then add the JSON URL as `updateFeed` in:

```text
~/Library/Application Support/Osiris Vault/runtime.json
```

The application checks on launch and every 24 hours. Update failures do not block offline use. A new release opens its download after user approval; the signed ZIP replaces the `.app`, not the vault.

## Teammate first run

1. Install the signed application in `/Applications`.
2. Open it and choose or create a vault folder.
3. Press **Start Osiris Vault**.
4. The app initializes its external database and manifest.
5. Use **Back Up Vault**, **Check Vault Integrity**, and **Export Portable Vault** from the application menu.

The Apple Silicon release embeds PostgreSQL 16, FFmpeg, FFprobe, Poppler PDF tools, and their non-system dynamic libraries. Codex chat requires that teammate's Codex installation/login. Local Whisper transcription is an optional module because its models and Python runtime are large.

## Rollback

Keep the previous signed application ZIP and the latest `.dump`, manifest snapshot, and SHA-256 receipt. To roll back, stop the Vault, replace only the application, and restore a database dump only when a schema migration actually changed the data.
