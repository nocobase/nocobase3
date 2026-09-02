# Route API

`createFileRoute()` returns a Hono Router with exactly six relative endpoints.
Mount it inside an application-owned `defineApiRoutes()` contribution below a
business path such as `/orders/:orderId/attachments`. The Application adds the
`/api` prefix.

This is the stable public route factory for application business features.

| Method   | Relative path  | Action                      | Authentication        |
| -------- | -------------- | --------------------------- | --------------------- |
| `GET`    | `/`            | List scoped files           | Required              |
| `POST`   | `/`            | Upload one multipart file   | Required              |
| `GET`    | `/:id`         | Read metadata               | Required              |
| `POST`   | `/:id/token`   | Issue a Private content URL | Required              |
| `GET`    | `/:id/content` | Stream content              | Public or valid Token |
| `DELETE` | `/:id`         | Delete object and record    | Required              |

There is no separate completion phase, upload intent, folder, batch, or storage
administration endpoint. The content endpoint deliberately does not run the
management authentication middleware after a valid Public or capability Token
decision.

## Create the Route

Use the assembly pattern in [quick start](quick-start.md). Do not write `/api`
in `router.route(...)`; the Application adds that prefix for every
`defineApiRoutes()` contribution.

`auth` handles login and authorization middleware for management operations.
`authorize` is optional, but an application business feature should use it to
delegate `list`, `upload`, `read`, `issue-token`, and `delete` to the App's
existing domain authorization. The callback receives the Hono context, the
exact `FileRouteAction`, and a record for record-specific actions.

Choose either `database` plus `table`/optional `scope`/`order`, or a custom
`store`; the two forms are mutually exclusive. `defaultDisk`,
`publicBasePath`, `audience`, and `auth` are also required.
The database Store factory is internal. Use the one-call
`database + table + scope` path for standard file tables, and implement the
high-level public `FileStore` contract only for a nonstandard schema.
`drive` and `tokenSecret` are typed as optional so a host can start with
missing infrastructure and receive stable `FILE_UNAVAILABLE` responses when
storage or Private Token operations are attempted. Keep Drive credentials and
the Token secret in server-only configuration; they are never request fields.

Do not create another ACL. For a database collection, register the collection
and use the App's existing authorization result and its field/record conditions
at the business boundary. The file Route cannot apply conditions to the parent
business record: authorize that parent through the application's normal
service/query before allowing the file operation. A plain guard is appropriate
only when a yes/no decision is sufficient.

## Request and response envelopes

JSON responses use `{ data: ... }` unless the response is `204` or an error.
List returns an array. Upload and metadata return the stable client fields plus
an unsigned `contentUrl`; they do not expose `disk` or `key`. For Private
content, request `POST /:id/token` and use its `{ url, expiresAt }` result. A
Public file returns the unsigned URL with `expiresAt: null`. Never store or log
a Token URL.

Delete is idempotent and returns `204`. A missing scoped record returns `404`
for read and content operations.

## Upload contract and validation

Send one `multipart/form-data` field named `file`. The server chooses the ID,
disk, storage key, visibility, and database table. Client input must not choose
`id`, `key`, `disk`, table, scope, or audience.

Before writing to storage, the Route validates:

- a File-compatible `file` field (`FILE_REQUIRED` when absent);
- `maxSize` (`FILE_TOO_LARGE`, normally `413`);
- configured exact MIME types (`FILE_TYPE_NOT_ALLOWED`).

The Route uses a 50 MiB single-file limit when `maxSize` is omitted and applies
the limit before storage or database mutation. The server normalizes the
display filename and generates the storage key independently; business code
must not derive a key from the uploaded filename.

When `maxFiles` is configured, one Route instance serializes upload limit
checks and writes by the current request path, which represents the actual
owner scope for the normal business route shape. Concurrent uploads for the
same owner in one process therefore cannot both pass the list check. Different
owners remain independent. Multiple application processes or nodes can still
exceed the limit without a database constraint or distributed mechanism.
Enforce one-to-one relations with a database UNIQUE constraint on the owner
field.

When `allowClientOverride` is false, an attempted `public` override must be
rejected as invalid input or ignored under a documented safe policy; rejection
is preferred. When true, accept only the boolean `public` value.

## Content streaming

The content endpoint first finds the record in the current Store scope. It
returns `404` when absent, allows a record with `public: true` without a Token,
or verifies a Private Token against the configured audience, file ID,
signature, and expiry. It then opens the Drive object and streams the bytes
without buffering the full file.

Public access still checks the database record on every request. Private Token
URLs are short-lived capabilities and must not be stored or logged.

## Errors and deletion

Known validation, limit, not-found, Token, and unavailable failures use stable
`FILE_*` codes. Authentication and authorization responses remain the
responses from the existing middleware or authorizer. Missing Database or
Drive maps to `503`.

Deletion is idempotent and returns `204` when the scoped record is already
absent. Version 1 has no soft delete, reference counting, cleanup queue, or
recycle bin.

See [quick start](quick-start.md) for the Route and client assembly pattern and
[data model](data-model.md) for one-to-one and one-to-many relations.
