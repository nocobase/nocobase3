# V3 settings management

Hub's `/hub/settings` page provides the first V3-native settings flow. File
storage settings use Hub's own V3 session, are authorized on the server,
isolated by App ID, written
atomically to the App data directory, and retained across restarts. Reads,
tests, successful saves, and failed saves append audit records to the same
store.

Configure these runtime-only values before saving S3 credentials:

```env
HUB_SETTINGS_STORE_PATH=./data/settings.json
HUB_SETTINGS_ENCRYPTION_KEY=<at-least-32-random-characters>
# Optional: otherwise the first registered user is the bootstrap administrator.
HUB_ADMIN_EMAILS=admin@example.com
```

The settings file is created with mode `0600`. The S3 access key ID and secret
access key are encrypted together with AES-256-GCM and are never returned to the
browser. Keep the encryption key outside built artifacts and back it up through
the deployment secret manager; losing it makes existing S3 credentials
unrecoverable.

This preview separates persistence from runtime application. A successful save
returns `pending-runtime-apply`; it does not claim that the running App has
switched storage drivers. Multi-instance deployments should replace the JSON
store with a shared database-backed implementation before production use.
