# Security

## Contents

- [Authorization](#authorization)
- [Credentials and network](#credentials-and-network)
- [Files and ZIP](#files-and-zip)
- [Destructive operations](#destructive-operations)

## Authorization

Every compatibility route requires an authenticated session with a user ID and returns 401 otherwise. Current routes do not enforce role, ownership, resource ACL, LOCAL-write policy, or administrative permission. Document responses currently project `accessAbility: "readWrite"` for every authenticated caller. This is a UI hint, not authorization.

Until a server-side policy layer is added, expose these actions only to trusted authenticated users or put an application-owned authorized proxy in front of them. Never rely on a hidden button, React gate, route visibility, `accessAbility`, or a TypeScript DTO.

## Credentials and network

`connectProps` contains plaintext connection fields in the plugin record, including optional password. Protect database access, API responses, backups, logs, and admin UI. Use environment-secret placeholders in code:

```ts
const connectionString = process.env.PGVECTOR_CONNECTION_STRING;
```

Do not serialize secrets into client bundles. Prefer server-side assembly of connection properties. Restrict outbound connections for external vector stores and validate TLS, DNS/IP allowlists, timeouts, and tenant boundaries.

## Files and ZIP

Accepted extensions are `.doc`, `.docx`, `.md`, `.pdf`, `.txt`, and `.zip`; extension checks do not prove content type. The advertised upload limit is 100 MiB and the client checks it, but the direct server upload path does not enforce that size itself. Add upstream/body limits and content inspection.

ZIP extraction skips directories and names containing a `..` path segment, normalizes backslashes, and stores only `path.basename`. However, it has no explicit entry count, per-entry size, aggregate uncompressed size, or compression-ratio limit. Treat untrusted ZIPs as high risk; scan and limit before calling the plugin. Nested ZIPs are ignored. Encoding choices are not currently applied by extraction.

Server-issued file URLs must be resolved against the App origin and fetched with active authentication headers when access is protected. Do not paste authenticated URLs into public logs or third-party viewers.

## Destructive operations

Before delete/rebuild/config changes: identify affected keys/IDs, back up database and durable files, test vector connection/model, estimate job volume, confirm production scope, and define rollback. Vector-database deletion is blocked when related bases are found, but relation checks and direct table state can be inconsistent. Document/base deletion has best-effort file deletion and may leave external vector rows; verify after completion.
