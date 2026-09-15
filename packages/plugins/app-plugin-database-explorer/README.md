# @nocobase/app-plugin-database-explorer

A read-only Settings page for browsing an application's database connections, the collections on each one, and their fields. The plugin owns no tables, contributes no migrations, and exposes no endpoint that writes anything.

## Register the plugin

```ts
// server/plugins.ts
databaseExplorer;

// client/plugins.ts
databaseExplorer();
```

The page is mounted at `/settings/database-explorer`. Register Authentication and Authorization before it on both runtimes; the routes resolve both.

## Access

Every endpoint requires authentication and then `page:database-explorer/access`, which is the same grant the navigation entry is declared with. One grant therefore governs the menu entry and a direct API call alike, so the entry can never be visible to someone the API refuses.

The seeded System Administrator permission set grants `page:*/access`, so an administrator sees the page with no further configuration. Any other role needs an explicit grant:

```json
{
  "resource": { "type": "page", "id": "database-explorer" },
  "actions": [{ "action": "access" }]
}
```

## Endpoints

| Method and path                                                              | Returns                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/database-explorer/connections`                                     | Every configured connection, and which one is default            |
| `GET /api/database-explorer/connections/:connection/collections`             | One page of collections; accepts `limit` (1–200) and `cursor`    |
| `GET /api/database-explorer/connections/:connection/collections/:collection` | The resolved definition, its fields, and any resolution warnings |
| `GET .../collections/:collection/physical`                                   | The physical columns, indexes, keys, and constraints behind it   |

Successful responses are `{ data }`; failures are `{ code, message }` with a stable `code`: `DATABASE_UNAVAILABLE`, `DATABASE_EXPLORER_FORBIDDEN`, `CONNECTION_NOT_FOUND`, `CONNECTION_UNAVAILABLE`, `CONNECTION_UNREACHABLE`, `SCHEMA_READ_DENIED`, `COLLECTION_NOT_FOUND`, `INVALID_LIST_OPTIONS`, or `INVALID_CURSOR`.

A collection's definition and its physical schema are separate requests because each one costs a full schema inspection. Bundling them would pay for two round trips against a possibly remote database every time someone clicks a collection, for a view most never open.

The definition and physical responses use the same document shapes as the collection artifact files under `database/<connection>/collections/<name>/`, so a response and a committed artifact can be compared field by field.

## What a connection reports

Listing connections reads configuration and opens no database. That is what keeps one unreachable external database from taking down the whole page, and it is a property of not making the call rather than of catching an error.

Each connection reports its `name`, whether it is the default, its `dialect` and `driver`, whether its schema is `managed` or `external`, the logical `databaseName` and `schemas` it targets, its `naming` options, and its declared `internalTables`.

It never reports `password`, `username`, `host`, `port`, `socketPath`, a SQLite `filename`, `ssl` material, `driverOptions`, or `pool`. The password is obvious. The rest are excluded because this page is for reading schemas: the account name is half a credential, and the host and file path locate the database for anyone who reaches the page, while neither helps a viewer understand a table.

That exclusion is enforced as an allow-list rather than a redaction pass, in `server/connection-summary.ts`. The dialect list is open, so a dialect package added later can introduce a field of its own — an API token, say. An allow-list keeps that field inside without anyone revisiting the file; a deny-list would publish it the day it was added.

## Reading changes nothing

`tests/read-only.test.ts` pins this against a real database: it snapshots `sqlite_master` and every row, exercises each read, and asserts both are unchanged. The test exists because the guarantee is not only about the statements this plugin issues. Reading a collection initializes the collection registry, whose metadata store creates its own bookkeeping table when it is missing, and an external connection is served by a directory-backed store that only reads files. The test is what would fail if a change further down moved schema work into a read path.
