# Route API

`createFileRoute()` returns a Hono Router with exactly six relative endpoints.
Mount it inside a `defineApiRoutes()` contribution below a business path such
as `/orders/:orderId/attachments`. The Application adds the `/api` prefix.

This is the stable public route factory for business modules. The plugin's
internal `createFileDemoRoutes()` composes its built-in Demo Router, while the
convention registrar only mounts that Router at `/api/attachments`; neither
Demo assembly API is exported from `@nocobase/app-plugin-file/server`.

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

Use the complete, type-checked
[purchase-order Route module](examples/purchase-order-files/routes.ts). It is
the executable reference for imports, service resolution, typed configuration,
middleware composition, scope validation, authorization, and the exported
`routes` array. Do not write `/api` in `router.route(...)`; the Application
adds that prefix for every `defineApiRoutes()` contribution.

`auth` handles login state. `authorize` is optional, but a business module
should use it to delegate `list`, `upload`, `read`, `issue-token`, and `delete`
to the existing authorization system. The callback receives the Hono context,
the exact `FileRouteAction`, and a record for record-specific actions.

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

The exact callback mapping is:

- `GET /` -> `list` without a record;
- `POST /` -> `upload` without a record;
- `GET /:id` -> `read` with the scoped record;
- `POST /:id/token` -> `issue-token` with the scoped record;
- `DELETE /:id` -> `delete` with the scoped record.

Do not create another ACL. For a database collection, register the collection
and use the existing authorization `authorize()` result and its field/record
conditions at the business boundary. A plain guard is appropriate only when a
yes/no decision is sufficient.

## Request and response envelopes

All JSON responses use `{ "data": ... }` unless the response is `204` or an
error. List returns an array. Upload and metadata return a client record with a
current, unsigned `contentUrl`; the client-facing record need not expose
`disk` or `key`:

```json
{
  "data": {
    "id": "file-123",
    "filename": "contract.pdf",
    "mimeType": "application/pdf",
    "size": 428193,
    "public": false,
    "contentUrl": "/main/api/orders/1001/attachments/file-123/content",
    "createdAt": "2026-08-27T09:00:00.000Z",
    "updatedAt": "2026-08-27T09:00:00.000Z"
  }
}
```

The unsigned URL is useful for Public content. For Private content the client
must request a Token URL first:

```json
{
  "data": {
    "url": "/main/api/orders/1001/attachments/file-123/content?token=...",
    "expiresAt": "2026-08-27T09:15:00.000Z"
  }
}
```

The Token is returned only inside the URL. Do not store or log it. Delete
returns `204` with no body, including when the scoped record is already absent.
A missing scoped record returns `404` for read and content operations.
For a Public record, the Token endpoint returns the unsigned content URL with
`expiresAt: null`; it does not create a long-lived Token.

## Upload contract and validation

Send one `multipart/form-data` field named `file`. The server chooses the ID,
disk, storage key, visibility, and database table. Client input must not choose
`id`, `key`, `disk`, table, scope, or audience.

Before writing to storage, the Route validates:

- a File-compatible `file` field (`FILE_REQUIRED` when absent);
- `maxSize` (`FILE_TOO_LARGE`, normally `413`);
- configured exact MIME types (`FILE_TYPE_NOT_ALLOWED`).

The Route uses a 50 MiB single-file limit when `maxSize` is omitted. It applies
the effective limit before `formData()` parses the complete multipart payload
and again to the parsed `File.size`. It rejects an
obviously excessive valid `Content-Length` immediately and independently
counts bytes read from missing, forged, or chunked lengths. The body allowance
is `maxSize` plus bounded multipart overhead: 1% of `maxSize`, clamped between
64 KiB and 1 MiB. The parsed `File.size` remains the authoritative second
check. This permits a file exactly at `maxSize` with normal boundary and part
headers while bounding memory and ensuring Drive and Store mutations do not
start after a request-level overflow.

The database `filename` preserves safe Unicode display text after removing
path segments, control and formatting characters, header delimiters, dot-only
names, and abnormal whitespace. The storage key is independent: a server UUID
plus only a short ASCII extension. It never contains the user basename.

When `maxFiles` is configured, one Route instance serializes upload limit
checks and writes by the current request path, which represents the actual
owner scope for the normal business route shape. Concurrent uploads for the
same owner in one process therefore cannot both pass the list check. Different
owners remain independent. Multiple application processes or nodes can still
exceed the limit without a database constraint or distributed mechanism.
Enforce one-to-one relations with a database UNIQUE constraint on the owner
field.

An empty browser MIME type must follow one documented consistent policy. Do not
perform content sniffing or virus scanning in version 1. If a database write
fails after storage succeeds, make a best-effort object removal and preserve
the original failure.

When `allowClientOverride` is false, an attempted `public` override must be
rejected as invalid input or ignored under a documented safe policy; rejection
is preferred. When true, accept only the boolean `public` value.

## Content streaming

The content endpoint first finds the record in the current Store scope. It
returns `404` when absent, allows a record with `public: true` without a Token,
or verifies a Private Token against the configured audience, file ID,
signature, and expiry. It then opens the Drive object and streams the bytes
without buffering the full file.

Set a safe `Content-Type` from the record MIME type, sanitize the filename for
`Content-Disposition`, and support `?download=1` for attachment disposition.
Token URLs should receive private/no-cache headers. Public access still checks
the database record on every request. Token content also sends
`Referrer-Policy: no-referrer` so capability URLs are not exposed through a
browser referrer.

HTML, SVG, XHTML, and XML content is always served as an attachment with a
restrictive sandbox Content Security Policy. PNG, PDF, audio, video, and plain
text remain eligible for inline preview.

## Errors and deletion

Known errors use stable codes such as `FILE_REQUIRED`, `FILE_TOO_LARGE`,
`FILE_TYPE_NOT_ALLOWED`, `FILE_LIMIT_REACHED`, `FILE_NOT_FOUND`,
`FILE_TOKEN_REQUIRED`, `FILE_TOKEN_INVALID`, `FILE_TOKEN_EXPIRED`, and
`FILE_UNAVAILABLE`. Authentication and authorization responses remain the
responses from the existing middleware or authorizer. Missing Database or
Drive maps to `503`; unexpected errors must not become false success.

Deletion removes the database record before the storage object so a database
failure cannot leave metadata pointing at a missing object. Object deletion is
best-effort after the record is gone: failures are logged and the Route still
returns `204`. Repeating a delete after the record is gone also returns `204`.
Version 1 has no soft delete,
reference counting, cleanup queue, or recycle bin.

See the complete [one-to-one](recipes/one-to-one.md) and
[one-to-many](recipes/one-to-many.md) recipes for integration examples.
