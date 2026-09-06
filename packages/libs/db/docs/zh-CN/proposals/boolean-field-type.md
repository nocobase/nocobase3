---
title: Boolean fields and schema inspection
description: Proposed boolean mappings across five databases, conservative Inspector classification, metadata resolution, strict value codecs, and constraint boundaries.
---

# Boolean fields and schema inspection

Status: partially implemented proposal, not a completed cross-database contract. Recorded on 2026-09-06. Implementation stages below distinguish shipped behavior from pending work. It shares the metadata/Inspector responsibilities of the [numeric](./numeric-field-types.md), [string](./string-field-types.md), and [date-time](./date-time-field-types.md) proposals.

## Logical contract

Implementation baseline: reuse scalar metadata and keep Oracle NUMBER emulation for this work; do not switch to native Oracle BOOLEAN. Inspector tests distinguish native booleans from numeric/bit representations. SQLite exposes declaration affinity and table STRICT status without claiming boolean enforcement. Inspector classification does not itself implement codecs or constraints.

Implementation stage 2: Repository boolean inputs now accept only `true`, `false`, or nullable `null`. Numeric-backed drivers receive 0/1 bindings. Reads decode native booleans and exact numeric/string 0/1 representations; any other stored value raises `INVALID_STORED_VALUE`. The same contract covers variables, unique selectors, filters, returning, relation projections, grouping, distinct, cursors, and streaming. Public numeric/string inputs remain invalid even when a driver uses those representations internally. Generated CHECK constraints and Builder default validation are not part of this codec stage; externally managed tables are never altered by metadata updates.

Keep one logical `boolean` type. Native BIT, small integers, and NUMBER are physical representations, not additional portable boolean types.

The recommended public value contract accepts and returns only `true`, `false`, and nullable `null`. Reject numeric and textual substitutes such as `1`, `0`, `'true'`, and `'false'` at the Repository boundary. Do not use JavaScript truthiness to normalize inputs or results. This strict end-to-end contract is a proposal, not a claim about every current path.

Internally, bind native booleans or exact 0/1 according to the dialect and driver. Decode only recognized boolean representations; invalid physical values such as 2 or -1 must report a data error, not silently become true. Recognizing an exact driver representation is distinct from accepting arbitrary public input coercion.

## Builder mapping direction

| Database   | Proposed physical storage                                                        | Required boundary                                                                                     |
| ---------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| PostgreSQL | `BOOLEAN`                                                                        | Native boolean domain; nullability remains separate                                                   |
| MySQL      | `TINYINT` with an enforced 0/1 CHECK                                             | BOOLEAN/BOOL are aliases, not native boolean enforcement; `(1)` display width adds no such constraint |
| SQLite     | `INTEGER` with a storage-class and 0/1 CHECK                                     | Ordinary affinity alone is insufficient; nullable handling must be explicit                           |
| Oracle     | SQL `BOOLEAN` on a verified supported version, or `NUMBER(1,0)` with a 0/1 CHECK | Default/version strategy and driver support remain to be decided                                      |
| SQL Server | `BIT`                                                                            | Native bit domain; Repository must still reject coercible non-boolean public inputs                   |

Use enforced constraints, not merely syntactically accepted CHECK clauses; MySQL version support must be accounted for. Numeric emulation must not permit additional stored values through unconstrained writes. Constraints validate the stored value after database conversions; they do not enforce the original application's input type.

For nullable SQLite integer storage, a candidate check is:

```sql
CHECK (
  enabled IS NULL
  OR (typeof(enabled) = 'integer' AND enabled IN (0, 1))
)
```

NOT NULL is an independent constraint. Final constraint naming, DDL generation, and lifecycle rules still need implementation design. Do not add CHECK constraints to existing external tables merely by updating metadata.

Oracle 23-series databases support SQL BOOLEAN; earlier versions commonly use NUMBER emulation. The current project test image is Oracle 23, but Builder still uses Knex's NUMBER(1,0) plus 0/1 CHECK. A test image does not determine the library's minimum supported Oracle version or prove complete native-BOOLEAN driver support.

## Inspector target

Inspector reads physical schema only. It must not read metadata or sample rows to guess a logical boolean type. Report native types, nullable state, defaults, and CHECK constraints independently.

| Database                        | Physical column                                            | Target `dataType`                  | Interpretation                                                                        |
| ------------------------------- | ---------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| PostgreSQL                      | `BOOLEAN` / `BOOL`                                         | `boolean`                          | Native boolean                                                                        |
| PostgreSQL                      | `BIT(n)` / `BIT VARYING`                                   | `native`                           | Bit strings, not booleans                                                             |
| MySQL                           | `TINYINT(1)`, including columns created using BOOLEAN/BOOL | `integer`                          | Original alias cannot be recovered; display width is not a boolean domain             |
| MySQL                           | `BIT(1)` / `BIT(n)`                                        | `native`                           | Bit values; no automatic boolean codec                                                |
| SQLite                          | Declared `BOOLEAN` / `BOOL` in an ordinary table           | `boolean`, declaration-based only  | Retain affinity/constraint information; do not claim native enforcement               |
| SQLite                          | `INTEGER`                                                  | Physical integer classification    | Exact integer category follows the numeric proposal; do not infer boolean             |
| Oracle with SQL BOOLEAN support | `BOOLEAN`                                                  | `boolean`                          | Requires native catalog/driver verification                                           |
| Oracle                          | `NUMBER(1,0)`                                              | Numeric category, target `decimal` | Current NUMBER inference may return integer; numeric proposal changes that separately |
| SQL Server                      | `BIT`                                                      | `boolean`                          | Boolean-like physical domain with nullable state                                      |
| SQL Server                      | `TINYINT` / `INT`                                          | `integer`                          | No boolean inference                                                                  |

SQLite BOOLEAN declarations have NUMERIC affinity and do not guarantee that values are 0/1. STRICT tables do not accept BOOLEAN as a declared type; integer plus constraints is the candidate strict representation. The public shape for declaration versus enforcement remains part of the SQLite inspection decision.

Do not apply SQL Server's BIT rule to PostgreSQL or MySQL. Use dialect-aware type matching, not a universal bit-to-boolean rule. A column name such as `enabled`, a false/zero default, or a CHECK limited to 0/1 is not sufficient to override a numeric category.

For example, a MySQL physical column may produce the following projection of the inspection result:

```javascript
{
  columns: [
    {
      columnName: 'enabled',
      dataType: 'integer',
      nativeType: 'tinyint',
      nullable: true,
    },
  ],
  checkConstraints: [
    {
      name: 'enabled_boolean_check',
      expression: 'enabled IN (0, 1)',
    },
  ],
}
```

Unrelated required schema properties are omitted. Native expression formatting varies by database. CHECK existence, enforcement, and successful metadata compatibility are different facts; do not infer arbitrary CHECK semantics through fragile text matching.

## Metadata and Resolver

Persist explicit `fields.enabled.type = 'boolean'`, including for native boolean columns. Metadata declares semantics; Inspector remains authoritative for the physical type. No new metadata system is required.

For MySQL integer emulation, the sequence is physical `integer` plus explicit boolean metadata, compatibility validation, then logical Collection `boolean`. Do not mutate Inspector output to match metadata.

Compatibility requires a supported representation and codec, not just a name match. Native booleans and verified integer/zero-scale decimal emulation can carry the domain; text, arbitrary BIT buffers, or fractional numeric columns must not be accepted without an explicitly supported mapping. Narrow or unusual native numeric types require capacity checks rather than a blanket scale-zero rule.

Distinguish newly created fields from external tables. Builder-created emulation should provide the agreed constraints. Existing numeric columns may lack them or contain invalid values: metadata does not clean or validate all existing rows, reads must reject invalid representations, and writes must use the strict codec. A separate requested audit/migration can validate and constrain existing data. Metadata and physical alterations must retain the existing atomicity/drift safeguards.

## Repository behavior and validation

- Use the same codecs for values, variables, selectors, defaults managed by Builder, filters, returning, relation projections, cursors, and streaming wherever the API supports boolean fields. Do not recursively rewrite numeric values inside arbitrary JSON.
- True filtering matches true, false filtering matches false, and NULL is separate. Negation follows SQL three-valued logic; false must not implicitly include NULL.
- Do not rely on MySQL nonzero truthiness or SQL Server input coercion to validate public values. Do not substitute arbitrary truthiness for exact 0/1 decoding.
- Sorting, distinct, grouping, and supported aggregates need dialect-aware tests; native boolean availability does not imply that every numeric operation or aggregate is valid.
- Driver versions/configuration determine actual result representations. Verify binding and decoding against real drivers, including Oracle native BOOLEAN before enabling that mapping.

## Current state and remaining decisions

Current Builder delegates boolean creation to Knex: PostgreSQL BOOLEAN, MySQL BOOLEAN alias, SQLite BOOLEAN declaration, Oracle NUMBER(1,0) with a check, and SQL Server BIT. Inspector already preserves MySQL tinyint as integer, treats SQL Server BIT as boolean, and recognizes BOOL/BOOLEAN declarations. Metadata persists scalar types; Resolver currently permits boolean metadata over integer or scale-zero decimal fields. These foundations do not prove strict codecs, uniform constraints, or safe existing-data handling are complete.

Sources: [Builder adapter](../../../src/schema/internal/knex/adapter.ts), [normalization](../../../src/schema/inspector/shared/type-normalization.ts), [Inspector API](../../../src/schema/inspector/types.ts), [metadata](../../../src/metadata/document.ts), [Resolver](../../../src/collection/resolver/resolver.ts), and [test database versions](../../../docker-compose.yml).

Before implementation, finalize Oracle's version/default policy, enforced CHECK generation, SQLite declaration/enforcement representation, supported driver representations, and error contracts. Keep numeric/string type work independent; this proposal does not reopen deferred BigInt/Decimal transport.

Tests must cover native types versus aliases/bit strings, true/false/null, defaults and NOT NULL, invalid public inputs, invalid external stored values, metadata absence and incompatibility, and reads/writes/filters/returning. Exercise CHECK enforcement using direct physical writes, and verify that ordinary numeric fields retain numeric semantics. Report five-database live results separately from mocked catalogs and SQL-generation tests. No data cleanup, historical migration rewrite, or automatic external-table alteration is in scope.
