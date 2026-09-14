# JSON Integration Tests

These tests cover the portable JSON value contract for Repository and Query.
`fixtures.ts` holds the value forms every suite here runs against, so adding a
form reaches all of them at once.

| File                  | Covers                                                              |
| --------------------- | ------------------------------------------------------------------- |
| `values.test.ts`      | Repository create, read, update, upsert, and stream                 |
| `query.test.ts`       | Query insert, select, update, and scalar subquery selections        |
| `relation.test.ts`    | Relation selections and nested relation writes                      |
| `consistency.test.ts` | The same rows read back through the other path, in both directions  |
| `round-trip.test.ts`  | Per-form value and type preservation, named so a failure says which |
| `defaults.test.ts`    | `notNull` columns with structured defaults, and altering a column   |

## Why the paths are crossed

Repository and Query encode and decode JSON through separate code, and a
mutation's RETURNING row is a third path again. Each one round-tripping its own
writes proves nothing about the others, so `consistency.test.ts` writes with one
and reads with the other.

## Why the fixtures look adversarial

A driver either parses a JSON column before handing back the row or returns the
stored text, and the returned value carries no evidence of which. Decoding
without knowing turns the JSON string `'{"a":1}'` into the object `{ a: 1 }` on
a parsing driver while leaving it a string elsewhere. The `string-looks-like-*`
fixtures are the only values that tell the two apart, which is why the dialect
declares `jsonResults` rather than letting the decoder guess.

## Database NULL and JSON null

`null` on the write side means database NULL. The API has no way to write the
JSON literal `null`, so `$jsonNull` and `$jsonAnyNull` only ever match rows
written outside it — which is why the filter tests seed those rows through raw
inserts.

JSON filter operators live under `tests/integration/repository/capabilities/`
because they are a separate database capability from JSON value storage.

## Why there is no scalar default

MySQL rejects every literal default on a json column, and Knex works around
that by compiling an object or an array to the expression form
`default ('{"a":1}')`. A scalar has no such form, so a scalar JSON default is
not expressible across dialects. Nothing declares one, and a column that ends
up holding one is reported on read rather than decoded silently.
