# Customer audit example

A NocoBase 3 business example showing customer CRUD → explicit audit output → retained operation history. It is registered in `@nocobase/app-template-examples`; the core audit plugin has no customer schema or universal UI.

Start the Examples App with `pnpm --filter @nocobase/app-template-examples dev`, complete its normal installation, sign in, and visit `<App base>/audit-example`. Create a customer with a name and an eleven-digit phone number beginning with 1, edit the number, and open operation history. Delete the customer and use Show all history to see the retained events. The example displays actor IDs and masked phone changes. Each authenticated user has a private customer/history workspace; there is no cross-user audit administrator role. The example initializes an `audit-example-member` Permission Set for authenticated users once and preserves subsequent administrative edits. All entries check this permission and record ownership. The page uses the same `audit-example.customer:*/list` authorization check as the customer list; it does not require a separate default page grant.

The explicit migration creates `auditExampleCustomers` and `auditExampleOperations`. The latter maps audit targets to targetType/targetId and retains ownerId independently of customer existence. The customer service owns authorization, optimistic locking, transactions and masking. It emits only successful created/updated/deleted facts, skips unchanged edits, and reports postcommit output failures without repeating committed work. Denied or failed operations do not produce success events.

## Entry points

All HTTP paths below are relative to the App's API base. Every route enforces authentication and its own business authorization.

| Method | Path                                   | Input/result                                                    |
| ------ | -------------------------------------- | --------------------------------------------------------------- |
| GET    | `/audit-example/customers`             | Current user's first 100 customers                              |
| POST   | `/audit-example/customers`             | `{ name, phone }` → created customer                            |
| PATCH  | `/audit-example/customers/:id`         | `{ id, version, name, phone }` → updated customer               |
| DELETE | `/audit-example/customers/:id`         | `{ id, version }` → `{ deleted: true }`                         |
| GET    | `/audit-example/operations?targetId=…` | Current user's newest 100 events; omit targetId for all targets |
| POST   | `/audit-example/maintenance`           | Same update input; authorize and dispatch a real queue Job      |

The App-owned WS path is `<App base>/audit-example/ws`. Send the same JSON input as PATCH; the reply is `{ data: customer }` or `{ code }`. The handler authenticates the handshake, rejects cross-origin browser requests, revalidates the session per message, checks ownership, and binds a new messageId for every operation. It is composed alongside `/ws` in the Examples App; the built-in Realtime protocol is unchanged. In local development, connect to the application server origin with a valid App cookie; the default dev command prints its Local URL. With PROXY_TARGET_URL, use the remote Backend origin because Vite proxies only API and Realtime paths.

Jobs use the host's queue and named factory registry. The dispatcher creates trusted ownerId from the authenticated identity; the worker binds a service actor, user initiator and actual jobId/attempt. Do not expose raw queue payloads as an unauthenticated identity source.

## Output ownership

The Examples App's `server/config/audit.ts` provides `{ writer: createCustomerAuditWriter(database) }`. Replacing it with `{ writer: createJsonlAuditWriter(absolutePath) }` redirects the same masked events into JSONL. Prepare the directory first. To reuse application-configured FS or S3 storage, use `createDriveAuditWriter({ disk: services.resolve(driveManagerToken).use('s3') })` from `@nocobase/audit/writers/drive`, importing the token from `@nocobase/app-server/drive`. It writes one JSONL object requesting private visibility per event. The database history page then stops receiving new events; provide a file-specific read path as needed. The core library owns the reusable adapters; this example owns the table mapping.

Lists are capped at 100; this demonstration does not implement pagination, retention jobs, audit administrator roles, denial capture, version restore or Workflow integration. A missing postcommit audit record is diagnosed but not compensated automatically.

Tests exercise real SQLite migrations and real login sessions, HTTP CRUD/history, cross-user denial, optimistic conflicts, Job dispatch, real WebSocket upgrades/message handling/session revocation, and client save/history behavior. Run `pnpm --filter @nocobase/app-plugin-audit-example check` from the repository root.
