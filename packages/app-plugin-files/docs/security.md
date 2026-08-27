# Security

The file Route separates authenticated management operations from content
access. It always resolves the current scoped database record before reading
content.

The built-in `/files-demo` management API is intentionally stricter than the
generic route contract: `/api/attachments/examples` and every Profile Avatar
or Order Attachment list, upload, metadata, Token, and delete operation require
the existing `system-administrator` Permission Set. An unauthenticated request
receives `401`; an authenticated non-administrator receives `403`. Public
content and valid Private Token content remain content capabilities and do not
run this management administrator check.

The Files-owned policy identifies the management resource as
`files.demo/management` and maps the standard route actions directly:
`list`, `upload`, `read`, `issue-token`, and `delete`. It resolves the current
authorization identity through `deps.authz.middleware()` and checks the
effective Permission Sets without changing the authorization plugin.

## Public content

`public: true` means that `GET /:id/content` does not require a Token. It does
not bypass the database. The Route still checks that the scoped record exists,
and a deleted record or a record changed back to Private immediately revokes
the old unsigned URL.

Public is not an infinite Token. A Route defaults to Private and accepts a
client visibility flag only when its server configuration explicitly sets
`visibility.allowClientOverride: true`.

Content responses classify HTML, SVG, XHTML, and XML MIME types and matching
file extensions as active content. Those responses always use
`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and a
restrictive sandbox Content Security Policy. Ordinary images, PDF, audio,
video, and plain-text previews remain inline. Built-in Demo upload allowlists
also exclude SVG.

Content-Disposition uses a conservative ASCII `filename` fallback together
with an RFC 5987 `filename*=UTF-8''...` value. Safe Unicode display names
therefore survive download without allowing quotes, CRLF, NUL, or path
injection.

## Private Tokens

`createFileRoute()` creates a short-lived URL for a Private record.
The Token payload is:

```ts
interface FileTokenPayload {
  version: 1;
  audience: string;
  fileId: string;
  expiresAt: number;
}
```

The wire format is:

```text
base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload-part))
```

Verification checks the two-part structure, Base64URL/JSON shape, version,
non-empty audience and file ID, exact audience, exact file ID, future epoch
seconds, and the HMAC with a timing-safe comparison. It also checks that the
database record still exists before streaming.

The default TTL is 900 seconds and the maximum is 86,400 seconds. Callers may
request a shorter positive TTL. Zero, negative, non-finite, and over-maximum
values must be rejected consistently by the service. A Token authorizes only
the content GET for its audience and file ID; it cannot list, upload, delete,
or issue another Token.

The Route returns `{ data: { url, expiresAt } }` and does not expose the Token
as a separate response field. The client can use the URL without knowing the
signing secret.

## Secret handling and threat boundaries

Pass the configured `config.session.secret` directly to `createFileRoute()` as
`tokenSecret`. Keep it server-side, do not put it in
browser bundles, and do not log it or Token values. Same-origin URLs should be
root-relative and include the current app base path exactly once.

The Token proves possession of a capability for one file and one audience; it
does not prove the caller's business identity or grant access to neighboring
records. The Store scope and business `authorize` callback provide the
management boundary. Public access still depends on a current database row.
Use a distinct audience for each business Route so a URL from one Route cannot
be replayed against another.

For management endpoints, run the existing authentication middleware and call
the application's existing authorization system. Do not accept user, role,
owner, table, scope, disk, key, or audience values from untrusted request data.
Validate Route IDs before resolving a Store scope.

The browser client accepts relative endpoints and same-origin absolute HTTP(S)
endpoints for management requests. It rejects cross-origin management
endpoints before reading authentication headers or calling `fetch`. File
records may still contain absolute third-party content URLs for preview or
download because those URLs are never used for authenticated management
requests.

## Version 1 non-goals

Version 1 intentionally does not provide soft delete, versions, reference
counting, folders, recycle bin, virus scanning, content sniffing, browser
direct upload, or an Office Online preview service. Storage and access remain
inside `createFileRoute`; business modules supply the existing Drive manager
and a scoped `FileStore` rather than calling a storage driver directly.

Do not use discarded upload-intent/complete phases, capability tickets, a
second ACL system, a generic Service Registry, or legacy `storages:*` actions.
In particular, do not add `storages:check` or `createPresignedUrl` calls to
business modules. Registry source is application-owned UI and never installs
server routes, migrations, secrets, or authorization logic.

See [route-api.md](route-api.md) for status/error behavior and the acceptance
tests in [one-to-one](recipes/one-to-one.md) and
[one-to-many](recipes/one-to-many.md).
