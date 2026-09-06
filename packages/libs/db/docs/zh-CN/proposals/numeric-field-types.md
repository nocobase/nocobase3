---
title: Numeric field types and schema inspection
description: Proposed numeric field mappings across five databases, physical inspection rules, metadata compatibility, and deferred SQLite and exact-value decisions.
---

# Numeric field types and schema inspection

Status: design proposal, not an implemented numeric API contract. Recorded on 2026-09-06. This document consolidates the agreed direction and separates unresolved choices from implementable schema work. It does not authorize or claim completion of exact-value transport.

## Scope and decision status

Implementation stage 1: physical columns now report optional `integerBits`, `binaryPrecision`, and `unsigned` separately from decimal `precision/scale`. Oracle NUMBER stays `decimal`; SQL Server FLOAT uses effective binary precision for classification. Resolver preserves these properties under field `db` together with `physicalDataType`. SQLite gains declaration `affinity` and table `strict` without redefining numeric categories or promising exact decimal. Range-value properties, range enforcement, and Builder numeric mappings remain outside this stage.

| Status                    | Scope                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direction settled         | Five logical numeric types, explicit metadata types, physical inspection independent of declaration intent, Oracle mapping corrections, and distinct SQL Server floating-point widths |
| Needs final specification | SQLite classification and enforcement, binary32 behavior on SQLite, decimal parameters/defaults, exact capability-property shape, and checks for native ranges                        |
| Deferred                  | SQLite exact-decimal storage/operations and BigInt/Decimal input/output codecs; see the [exact-value proposal](./precise-numeric-values.md)                                           |

The [date-time proposal](./date-time-field-types.md) uses the same ownership rule: metadata declares semantics, Inspector describes physical structure, and Resolver validates compatibility. Scalar type persistence is already present in the current metadata implementation; this proposal reuses it rather than introducing a second type store.

## Logical types

| Type      | Proposed logical meaning        | Boundary                                                               |
| --------- | ------------------------------- | ---------------------------------------------------------------------- |
| `integer` | Signed 32-bit integer           | `-2147483648` through `2147483647`                                     |
| `bigInt`  | Signed 64-bit integer           | `-9223372036854775808` through `9223372036854775807`                   |
| `decimal` | Exact base-10 value             | Decimal precision `p` and scale `s`; not a binary floating-point value |
| `float`   | Approximate IEEE binary32 value | 32-bit storage format, 24 significant binary digits                    |
| `double`  | Approximate IEEE binary64 value | 64-bit storage format, 53 significant binary digits                    |

These are semantic targets, not promises about JavaScript return types. `bigInt` boundaries above are text, not safe JavaScript number literals. Floating-point rounding, non-finite values, underflow, and signed zero still need a value-level contract; a DDL mapping alone does not define them.

`increments` remains a convenience declaration normalized to an integer type plus auto-increment and primary-key structure. Do not infer a key name or numeric key type. Unsigned columns remain explicit dialect capabilities, not the default portable integer contract; in particular, unsigned 64-bit integers exceed the signed `bigInt` range.

For decimal, keep `precision` and `scale` as named parameters. A possible portable profile is explicit `1 <= p <= 38` and `0 <= s <= p`, excluding SQLite until a precise backend is chosen. This profile and defaults are not finalized. Inspector must still preserve broader native capabilities, including unconstrained PostgreSQL numeric and native negative scales, rather than coercing them into the portable profile.

## Proposed Builder mappings

| Logical type | PostgreSQL         | MySQL          | SQLite                                         | Oracle                                    | SQL Server           |
| ------------ | ------------------ | -------------- | ---------------------------------------------- | ----------------------------------------- | -------------------- |
| `integer`    | `INTEGER`          | `INT`          | `INTEGER`, with logical int32 bounds           | `NUMBER(10,0)`, with logical int32 bounds | `INT`                |
| `bigInt`     | `BIGINT`           | `BIGINT`       | `INTEGER`, requiring lossless driver transport | `NUMBER(19,0)`, with logical int64 bounds | `BIGINT`             |
| `decimal`    | `NUMERIC(p,s)`     | `DECIMAL(p,s)` | No native exact equivalent; pending            | `NUMBER(p,s)`                             | `DECIMAL(p,s)`       |
| `float`      | `REAL`             | `FLOAT`        | `REAL` storage; binary32 behavior pending      | `BINARY_FLOAT`                            | `REAL` / `FLOAT(24)` |
| `double`     | `DOUBLE PRECISION` | `DOUBLE`       | `REAL`                                         | `BINARY_DOUBLE`                           | `FLOAT(53)`          |

- Oracle `NUMBER(10,0)` and `NUMBER(19,0)` can hold the complete signed ranges but also allow values outside them. Logical validation is necessary; whether Builder also creates range CHECK constraints must be specified before implementation. Identity columns require the same audit as ordinary numeric columns.
- Oracle `FLOAT(p)` is a NUMBER subtype, not IEEE binary32. Do not map logical floating-point types through generic Knex defaults.
- SQLite `REAL` stores binary64, not binary32. Rounding writes alone is insufficient to promise binary32 behavior for filters, arithmetic, or aggregates.
- Creating SQLite `DECIMAL(p,s)` does not provide exact-decimal arithmetic or enforce `p/s`. Metadata cannot add those capabilities. Text, scaled-integer, extension-backed, and explicit-unsupported approaches remain alternatives, not approved mappings.
- Native overrides retain native limits and semantics. Do not silently expand ranges or substitute approximate storage for a declared exact type.

## Inspector target

`dataType` is a physical category, not proof of the complete logical range. Always preserve `nativeType` and its relevant modifiers. Do not infer metadata from field names, observed values, or a guessed original Builder call.

| Database   | Native types                                        | Target physical category and details                                                                                    |
| ---------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | `smallint`, `integer`, `bigint`                     | `integer` for 16/32-bit; `bigInt` for 64-bit; signed                                                                    |
| PostgreSQL | `numeric`, `decimal`                                | `decimal`; preserve specified precision/scale or their absence                                                          |
| PostgreSQL | `real`, `double precision`                          | `float`, `double` respectively                                                                                          |
| MySQL      | `tinyint`, `smallint`, `mediumint`, `int`, `bigint` | `integer` or `bigInt`; retain 8/16/24/32/64-bit width and unsigned; display width is not capacity                       |
| MySQL      | `decimal`, `float`, `double`                        | `decimal`, `float`, `double`; classify the actual catalog type, not the spelling of a DDL alias                         |
| Oracle     | `NUMBER`, including `NUMBER(p,0)`                   | `decimal`; do not infer int32/int64 solely from decimal digit counts                                                    |
| Oracle     | `FLOAT(p)`                                          | `decimal` NUMBER-family category; preserve binary precision separately from decimal precision                           |
| Oracle     | `BINARY_FLOAT`, `BINARY_DOUBLE`                     | `float`, `double` respectively                                                                                          |
| SQL Server | `tinyint`, `smallint`, `int`, `bigint`              | Integer categories and widths; `tinyint` is unsigned                                                                    |
| SQL Server | `decimal`, `numeric`, `money`, `smallmoney`         | `decimal`; preserve native range and scale, especially money limits                                                     |
| SQL Server | `real`, `float(1..24)`, `float(25..53)`             | `float` for effective binary32, `double` for effective binary64; catalog metadata may normalize the requested precision |

MySQL `TINYINT(1)` must not become boolean solely because its display width is one. Boolean semantics come from explicit metadata when the physical representation is ambiguous.

### SQLite remains a separate decision

Report the declared type, effective affinity, and STRICT status separately. Ordinary-table affinity is a conversion preference, not a guarantee that every stored value has the same storage class. STRICT tables still have distinct `ANY` behavior and do not provide native exact decimal.

- INTEGER storage supports signed 64-bit integers, but this alone does not justify unconditionally changing every INTEGER-affinity column to logical `bigInt`.
- REAL storage is binary64; the current `float` category is misleading if `float` means binary32.
- NUMERIC affinity must not be advertised as exact decimal. A `native` category plus affinity is a candidate, not yet the final public shape.
- Do not scan rows to infer field types. Resolver must distinguish physical storage capacity from enforcement guarantees.

### Candidate capability properties

Keep existing `nativeType`, `unsigned`, and decimal `precision/scale`. Proposed additions need a single finalized interface before implementation:

| Candidate information                   | Purpose                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `integerBits`                           | Integer width, distinct from display width                                                      |
| `binaryPrecision`                       | Significant binary digits, e.g. 24/53 for IEEE floats or 126 for Oracle FLOAT; not storage bits |
| Exact minimum/maximum, if exposed       | Native range limits expressed as strings, not unsafe JavaScript numbers                         |
| SQLite affinity and table STRICT status | Distinguish declaration from enforcement; STRICT is table-level information                     |

Unknown precision must remain unknown. Do not invent decimal precision for unconstrained NUMBER/NUMERIC, or confuse binary precision with decimal digits. Preserve enough native information to distinguish IEEE floating point from Oracle's NUMBER-based FLOAT even when both expose binary precision.

## Metadata and Resolver compatibility

Persist explicit scalar logical types under `fields[name].type`. Physical precision, scale, indexes, and nullability remain Inspector-owned; logical constraints that cannot be recovered need an explicit design rather than an implicit override.

Distinguish two workflows:

1. **Builder-created portable fields:** the selected physical storage must accommodate the full declared logical domain, with additional checks where physical storage is wider. For example, Oracle `NUMBER(9,0)` cannot support the full int32 range.
2. **Existing external fields:** retain narrower native capabilities such as SMALLINT or MONEY. Do not reject the table simply because the physical category has less range than the default logical type. Reads, writes, and schema comparison must preserve the actual limits; this requires capability-aware resolution, not just a type-name substitution.

Explicit metadata must be checked for compatibility. Oracle `NUMBER(10,0)` plus `integer` metadata can represent int32 with range rules; SQLite NUMERIC affinity plus `decimal` metadata cannot manufacture exact arithmetic. Without metadata, use conservative physical classification. Metadata alteration alone does not validate or convert existing data.

## Current implementation gaps

Source snapshot at drafting time, not results of a new five-database run:

| Area                            | Current behavior                                                                       | Proposed correction                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Oracle ordinary integer columns | `NUMBER(9,0)` / `NUMBER(18,0)`                                                         | Accommodate full int32/int64 ranges; audit identity paths too                 |
| Oracle float/double Builder     | Generic Knex mapping uses NUMBER-family types; default double mapping is `NUMBER(8,2)` | Explicit binary float mappings                                                |
| SQL Server float/double Builder | Both use default `FLOAT`                                                               | Explicit binary32/binary64 mapping                                            |
| SQLite numeric Builder          | Knex maps decimal, float, and double to `float`                                        | Separate approximate storage from exact-decimal capability                    |
| Oracle Inspector                | Zero-scale NUMBER with precision up to 9/18 becomes integer/bigInt                     | Preserve NUMBER as decimal and let metadata declare logical integers          |
| Numeric normalization           | SQLite REAL becomes float; SQL Server FLOAT always becomes double                      | Dialect-aware effective-width classification                                  |
| Metadata                        | Scalar logical type persistence already implemented                                    | Reuse lifecycle and extend numeric compatibility, not another metadata schema |

Source references: [Builder mappings](../../../src/schema/internal/knex/adapter.ts), [type normalization](../../../src/schema/inspector/shared/type-normalization.ts), [Oracle Inspector](../../../src/schema/internal/knex/inspectors/oracle.ts), [physical column API](../../../src/schema/inspector/types.ts), [metadata](../../../src/metadata/document.ts), and [Resolver](../../../src/collection/resolver/resolver.ts).

## Staged implementation and verification

1. Finalize capability properties and the SQLite inspection decision; add Inspector fixtures for five databases, preserving native types and distinguishing absent, zero, signed, and binary precision.
2. Implement capability-aware Resolver compatibility using existing metadata persistence. Test missing metadata, incompatible declarations, external narrow columns, and field lifecycle operations.
3. Correct Builder mappings with boundary tests and schema round trips. Test ordinary and identity columns separately. Keep native-only unsigned behavior explicit.
4. Resume exact-value codecs only after the separate transport decision. Verify values, filters, atomic mutations, relation keys, cursors, returning, and aggregates without precision loss; do not infer support from successful DDL.

Numeric tests must cover signed boundaries, unsigned native limits, SQLite mixed storage/STRICT distinctions, NUMBER scale variants, and floating-point effective precision. Live database results must be reported separately from SQL-generation or mocked catalog tests. Do not rewrite historical migrations or silently convert existing data.

This documentation change starts no numeric runtime implementation and changes no BigInt/Decimal transport decision. Formal usage documentation should change only when corresponding behavior is implemented and verified.
