# Files Core Host integration

## Current repository decision

Core host integration: NOT APPLIED — no eligible core composition root found.

The repository search found Hono servers only in `packages/app-template-default/server` and `packages/hub/server`; both implement Portal static hosting and `/v2/api` upstream proxying. They do not own the Core API's authenticated Actor/Workspace context, Kysely instance, module registration, or scheduler. `packages/app-host` is also a hosting/proxy boundary. Files must not be mounted in any of them.

## Host prerequisites

The real Core API Host must provide:

```text
validated private Files config and secrets
Kysely<FilesDatabase>
Files migrations in the host migration lifecycle
authenticated Actor and Workspace resolver
FileAuthorizer adapter
Local/S3 StorageDriver registry
Hono business API composition root
optional existing scheduler
```

## Mount example

```text
Core authentication middleware
        |
        v
Actor/Workspace resolver -----> FileAuthorizer
        |                              |
        +----------+-------------------+
                   v
createFilesModule({ db, config, requestContext, authorizer, drivers })
                   |
                   +--> app.route("/api/files/v1", files.router)
                   `--> host scheduler calls files.maintenance.runOnce()
```

```ts
const files = createFilesModule({
  db,
  config: validatedPrivateConfig,
  requestContext: {
    getActor: context => context.get("authenticatedActor"),
    getWorkspaceId: context => context.get("authenticatedWorkspaceId"),
  },
  authorizer,
  drivers,
  logger: redactedLogger,
});

coreApi.route("/api/files/v1", files.router);
```

Run `FilesMigrationProvider` through the host's normal Kysely migrator before serving traffic. Do not create a second database connection per request and do not translate the schema to a legacy attachment table.

If the host already has a scheduler, invoke `expireUploads` and `deletePendingObjects` in bounded batches. The host owns frequency, leader election, retries around process failure, metrics, and shutdown. Without a scheduler, expose the service to host composition; do not add an import-time timer.

For browser-direct S3-compatible PUT, configure provider CORS for the Portal origins, `PUT`, and only the returned signed headers. Never forward Portal Authorization, Cookie, or custom workspace headers to the object-store target.

## Production checklist

- Keep Local roots and S3 credentials outside public config and source control.
- Use a private container and short upload/read TTLs.
- Wire actor/workspace exclusively from authenticated host context.
- Apply Files migrations and verify database backups.
- Register only the seven public API operations plus internal Local delivery.
- Schedule bounded maintenance and monitor its aggregate counts with redacted logs.
- Configure S3 CORS and credential rotation.
- Persist App relations as `fileId`, not URLs or storage keys.
- Treat relation removal and Kernel deletion as separate operations.
- Run `pnpm files:check-contracts` during CI.
