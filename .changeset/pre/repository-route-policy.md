---
'@nocobase/app-server': minor
'@nocobase/app-plugin-file': minor
'@nocobase/db': minor
'@nocobase/app-plugin-repository-example': patch
'@nocobase/app-plugin-file-example': patch
'@nocobase/app-template-examples': patch
'@nocobase/api-client': patch
---

Replace the Repository API's per-action `writePolicy` with a Repository Policy
declared once per exposure.

**Breaking.** `defineRepositoryApiRoutes()` no longer accepts `writePolicy` on
an action, and every exposure must declare a `policy`. An action configuration
now says only that an endpoint exists; what it may do is the exposure's Policy,
which governs reading, creating, updating and deleting together. Declaring one
is required rather than optional because `writePolicy` defaulted to refusing
writes while an absent Policy restricts nothing — making it optional would have
turned every existing declaration from "refuse every write" into "allow
everything" without a word of warning.

Declare `policy` as a function of a principal, together with a
`principal(context)` resolver, to scope rows to the caller. The resolver belongs
to the application, since this router installs no authentication; one that
returns nothing refuses the request with 403 `PRINCIPAL_REQUIRED` rather than
binding a Policy built from a principal that is not there. A fixed Policy is
still normalized when the routes are defined, so a malformed one fails where it
is written; a Policy function cannot be, and its `INVALID_POLICY` now reaches
the host error handler as a server error instead of being reported to the caller
as a 400.

`@nocobase/db` gains `buildRepositoryPolicy`, a builder whose unmentioned nodes
are denied, so the four-node requirement costs nothing to satisfy while the
default stays refusal. Two related fixes travel with it: `create`, `update` and
`delete` nodes that are `false` now refuse a write before its payload is read,
so an empty body is reported as forbidden rather than as invalid input; and a
`create` node whose relations grant `update`, `upsert`, `disconnect`, `set` or
`delete` is refused during normalization, since a root create performs none of
them.

`@nocobase/app-plugin-file` exposures declare a Policy too, and it reaches
uploads: the upload path binds a Policy derived from the exposure's, inheriting
`create.scope` and `create.defaults` and substituting the file columns for the
field allowlist. A file uploaded under a scoped Policy therefore lands inside
the scope the same exposure reads from. The public content route under
`accessPath` is unchanged and deliberately outside it.

The method-level `writePolicy` option on `db.repository()` calls is unaffected
and remains available for narrowing a single call.
