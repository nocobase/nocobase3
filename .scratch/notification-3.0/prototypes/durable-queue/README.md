# PROTOTYPE — Notification durable queue

This throwaway prototype answers one question: can the notification Delivery state machine use the same claim, lease, retry, fallback, and crash-recovery contract on SQLite and PostgreSQL without silently sending the same SMTP message twice?

It is not production code and must not be imported by the notification module.

## Run the database probe

From the repository root:

```bash
node .scratch/notification-3.0/prototypes/durable-queue/prototype.mjs
```

The probe always runs against a temporary SQLite file. If local PostgreSQL is reachable, it also creates a uniquely named temporary schema in the configured database, runs the same scenarios, and removes the schema afterward.

Optional PostgreSQL connection variables:

```text
NOTIFICATION_PROTO_PGHOST
NOTIFICATION_PROTO_PGPORT
NOTIFICATION_PROTO_PGUSER
NOTIFICATION_PROTO_PGDATABASE
NOTIFICATION_PROTO_PGPASSWORD
```

Set `NOTIFICATION_PROTO_SKIP_POSTGRES=1` to run SQLite only.

## Review the state model

Open [`walkthrough.html`](walkthrough.html) directly in a browser. It contains guided happy-path, retry/fallback, safe pre-send recovery, and uncertain-submission walkthroughs.

## Scratch data

- SQLite uses a randomly generated directory under the operating system temporary directory.
- PostgreSQL uses a schema named `notification_queue_proto_<process id>`.
- Both are removed in `finally` cleanup.
