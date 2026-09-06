---
title: String field types and schema inspection
description: Proposed char, string, and text inspection across five databases, with logical mappings, length units, Unicode, collation, and metadata boundaries.
---

# String field types and schema inspection

Status: design proposal, not an implemented portability contract. Recorded on 2026-09-06. This document continues the [numeric](./numeric-field-types.md) and [date-time](./date-time-field-types.md) proposals. No runtime changes accompany it.

## Decision summary

Implementation stage 1: Inspector now exposes `char` separately and reports optional `lengthUnit` (`characters`, `bytes`, or `utf16CodeUnits`), `maxByteLength`, `characterSet`, `collation`, and `collationSchema` when available. Missing properties mean unknown/not reported, not unlimited capacity. SQLite retains declaration-based classification and adds column `affinity` plus table `strict`; a declared CHAR width is not enforced. Oracle charset/collation discovery remains pending rather than guessed.

Resolver exposes existing physical CHAR as logical `string` for current Repository compatibility, while preserving `db.physicalDataType = 'char'`, native type, and physical capabilities. It does not trim/pad values or change native comparisons. Oracle CHAR equality with VARCHAR-bound operands can require explicit trailing spaces; this is tested as native behavior. No `c.char()` or new portable logical length policy is introduced.

| Area                 | Direction                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspector            | Distinguish `char` (fixed-length), `string` (variable-length), and `text` (large text) instead of merging CHAR into string                          |
| Collection / Builder | Retain `string` and `text` as the current portable entry points; a first-class logical `char` type and `c.char()` remain a separate decision        |
| Physical details     | Retain native type, length unit, capacity, charset, and collation; do not add a redundant `fixedLength` flag when the category already expresses it |
| SQLite               | A CHAR declaration does not enforce fixed-length storage; classification and enforcement must remain separate                                       |
| Still open           | Logical length/defaults, Unicode prerequisites, Oracle empty strings, MySQL text tier, and the exact capability/metadata interface                  |

## Logical types and scope

| Type     | Recommended meaning                                          | Boundary                                                                              |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `string` | Variable-length string with a declared/default length policy | Define length units and overflow behavior before promising cross-database equivalence |
| `text`   | Large variable-length text                                   | Not unlimited; size, indexes, comparison, and LOB handling depend on the database     |

Keep these two portable entry points for now rather than adding every native variant as a logical type. Whether to add logical `char` must be decided separately from Inspector classification; do not advertise `c.char()` as implemented. Native variants remain available through explicit native configuration and inspection. UUID, JSON, binary data, enum validation, and application-specific formats such as email are separate semantics; a physical character column does not prove any of them.

Recommended value behavior is to preserve text without automatic trimming, Unicode normalization, case conversion, or stringification of arbitrary values. Unicode validity, embedded NUL handling, length enforcement, and Oracle empty strings require explicit rules before implementation. String fields and keys do not imply a primary key or the name `id`.

## Builder mapping direction

This table describes candidate storage families, not identical enforcement of `length: n`. The number used in DDL may need to differ from the logical limit once its unit is settled.

| Logical type | PostgreSQL   | MySQL                                       | SQLite                             | Oracle                                                                | SQL Server                                                       |
| ------------ | ------------ | ------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `string`     | `VARCHAR(n)` | `VARCHAR(n)`, utf8mb4-capable configuration | `TEXT` plus a logical length limit | `VARCHAR2(n CHAR)` with an appropriate Unicode database character set | `NVARCHAR(n)` with supplementary-character-capable configuration |
| `text`       | `TEXT`       | `TEXT` family; default tier still to decide | `TEXT`                             | `CLOB` with an appropriate Unicode database character set             | `NVARCHAR(MAX)`                                                  |

- **PostgreSQL:** character limits are distinct from encoded byte size. Unbounded VARCHAR and TEXT remain different native declarations even if their practical behavior overlaps. Unicode support depends on database encoding.
- **MySQL:** use utf8mb4 rather than treating the older three-byte UTF-8 encoding as full Unicode. VARCHAR is constrained by row/byte limits as well as its character count. TEXT tiers have byte capacities: ordinary TEXT is limited to 65,535 bytes; MEDIUMTEXT and LONGTEXT are not equivalent defaults. Do not silently change a deployment's character set or collation.
- **SQLite:** a VARCHAR length declaration is not enforced. TEXT storage alone cannot retain a logical limit, so metadata and validation, or an explicit physical CHECK design, are required. Ordinary-table affinity is not strict type enforcement.
- **Oracle:** specify CHAR versus BYTE semantics explicitly instead of inheriting session defaults. VARCHAR2 still has a physical byte ceiling depending on database configuration, even with CHAR semantics. NVARCHAR2/NCLOB are alternatives for a national-character-set policy, not automatic synonyms. The Unicode policy must be checked, not inferred from the logical type.
- **SQL Server:** NVARCHAR's `n` counts UTF-16 byte-pairs, not Unicode code points. A supplementary character uses two units; NVARCHAR(64) cannot store every possible sequence of 64 Unicode code points. Non-MAX NVARCHAR is limited to 4,000 such units. VARCHAR with UTF-8 collation is another native option, not the proposed default.

## Length must have a unit

The current `length` property is insufficient to promise a single portable limit. For example, JavaScript `'😀'.length` is 2 UTF-16 code units, while the string contains one code point and occupies four UTF-8 bytes. A grapheme such as an emoji sequence can contain multiple code points.

The recommended direction is a logical maximum measured in Unicode code points, plus independent physical byte/unit validation. This remains a decision, not an approved API change: SQL Server may need a wider column than the logical count, and Oracle/MySQL still impose byte limits. A native-unit policy is an alternative but must not be advertised as identical across databases.

Before implementation, settle:

1. The logical unit and default length. Current shortcuts generally inherit Knex's default of 255; that is implementation behavior, not a newly approved portable guarantee.
2. Where to persist the declared logical limit when it differs from physical capacity. Storing `type` alone is insufficient for SQLite TEXT or widened SQL Server columns.
3. Rejection of invalid lengths and overlong values without silent truncation, including native column byte ceilings. Driver/database coercion is not a substitute for this policy.

## Inspector target

Inspector reports physical categories and capabilities, not the original Builder intent. The target categories are `char` for fixed-length character types, `string` for variable-length character types, and `text` for large text. The category does not promise identical padding, collation, or LOB behavior across databases.

| Database   | Native types                                           | Recommended category and retained details                                                                              |
| ---------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | SQL `CHAR(n)` / `CHARACTER(n)`, catalog `bpchar`       | `char`; preserve length and native blank-padding semantics                                                             |
| PostgreSQL | `varchar`, `character varying`                         | `string`; retain bounded/unbounded length and collation                                                                |
| PostgreSQL | `text`, `citext`                                       | `text`; retain native/extension identity and collation; CITEXT has distinct comparison behavior                        |
| MySQL      | `char`                                                 | `char`; retain character/byte capacities, charset, collation, and native padding behavior                              |
| MySQL      | `varchar`                                              | `string`; retain character/byte capacities, charset, and collation                                                     |
| MySQL      | `tinytext`, `text`, `mediumtext`, `longtext`           | `text`; preserve tier, byte capacity, charset, and collation                                                           |
| Oracle     | `CHAR`, `NCHAR`                                        | `char`; retain BYTE/CHAR semantics, byte capacity, and character-set family                                            |
| Oracle     | `VARCHAR2`, `NVARCHAR2`                                | `string`; retain declared length semantics, byte capacity, and character-set family                                    |
| Oracle     | `CLOB`, `NCLOB`, legacy `LONG`                         | `text` category with native restrictions retained; LONG is not a recommended creation type                             |
| SQL Server | `char`, `nchar`                                        | `char`; retain units, byte capacity, and collation                                                                     |
| SQL Server | `varchar`, bounded `nvarchar`                          | `string`; retain units, byte capacity, and collation                                                                   |
| SQL Server | `varchar(max)`, `nvarchar(max)`, legacy `text`/`ntext` | `text`; distinguish MAX from legacy types and retain encoding/collation                                                |
| SQLite     | TEXT-affinity declarations                             | Preserve declaration, affinity, and STRICT status; exact `dataType` classification remains part of the SQLite decision |

Candidate physical information includes a declared length and its unit, maximum byte length, character set, and collation. `char` already expresses the fixed-length type category, so a duplicate `fixedLength: true` flag is not proposed. An enforcement capability for SQLite is a different fact, not a redundant type flag. These property names and interfaces are not finalized. Missing information must remain unknown, not become a guessed default. Table/column collation also does not describe every expression or index-specific collation; retain overrides where inspected.

### Fixed-length does not mean exact-length input

SQL CHAR commonly accepts a shorter value and pads it. It is not a validation rule that the caller must provide exactly `n` characters. A business requirement such as an exactly eight-character code needs explicit validation; neither CHAR(8) nor a string maximum of eight establishes that input contract.

Illustrative target Inspector results, not current API output:

```javascript
// PostgreSQL fixed-length character column.
{
  columnName: 'code',
  dataType: 'char',
  nativeType: 'character(8)',
  length: 8,
}

// PostgreSQL variable-length character column.
{
  columnName: 'code',
  dataType: 'string',
  nativeType: 'character varying(8)',
  length: 8,
}
```

Length units and other column properties are omitted here only to highlight classification. PostgreSQL's internal catalog type `"char"` is not SQL CHAR(n); handle it separately rather than confusing it with `bpchar`.

For SQLite, CHAR(8) is a declaration with TEXT affinity, not fixed-length enforcement or automatic padding. Whether to expose a declaration-based `char` category with an explicit enforcement qualifier, or use an affinity-based category, remains open. Neither choice may claim a fixed-width guarantee. SQLite STRICT does not accept CHAR(n) as a declared type.

Do not flatten Oracle `VARCHAR2(64 BYTE)` and `VARCHAR2(64 CHAR)` into an indistinguishable declaration. Do not call SQL Server NVARCHAR capacity a count of Unicode code points. A database-specific collation name must not be converted into universal `caseSensitive`/`accentSensitive` flags unless that interpretation is reliable.

## Comparison and empty-string boundaries

- **Case, accents, and Unicode normalization:** equality, sorting, grouping, distinct, and uniqueness depend on collation and operators. Query-level insensitive filtering is not the same as changing a unique index's collation. No universal ordering or automatic normalization is promised.
- **Trailing spaces and fixed-width CHAR:** padding, retrieval, and comparison rules differ by type, collation, database, and driver. Do not introduce additional trimming or padding at the application layer to hide the differences. Native storage/retrieval may already transform trailing spaces, so byte-for-byte recovery of the original input is not a portable promise.
- **Oracle empty strings:** empty ordinary character strings are treated as NULL. A portable contract cannot promise `''` distinct from NULL for ordinary VARCHAR2 fields. Decide whether Oracle writes explicitly reject empty strings or whether the API adopts a documented collapse; do not silently normalize all databases. Empty CLOB locators can be distinct from NULL, but LOB binding must be tested separately.
- **NUL and invalid Unicode:** PostgreSQL text cannot store a zero byte. Decide a portable rejection rule for NUL and unpaired UTF-16 surrogates rather than silently stripping or replacing them.
- **Large text:** CLOB/TEXT/MAX fields do not share ordinary string indexing, uniqueness, equality, grouping, or sorting capabilities. Validate each operation; a broad `text` category cannot grant every Repository operator. LOB retrieval, returning, and streaming need explicit driver tests.

## Metadata and Resolver

Reuse explicit `fields[name].type` persistence for `string` and `text`. Physical constraints remain Inspector-owned. Persist a separate logical limit only when its meaning and representation have been finalized; do not copy the entire physical schema into metadata.

Resolver checks both type compatibility and required capabilities. Inspector `char` must not silently become an ordinary variable-length string with its physical semantics erased. Before introducing the category, specify how existing CHAR columns flow into Collection and Repository: preserve the native fixed-length behavior, or explicitly report unsupported capability until an adapter exists. Do not invent metadata `type: 'char'` as an already approved portable Builder contract. MySQL TEXT and Oracle CLOB may be text categories without permitting the same index or aggregate operations. No metadata means conservative physical inference, not a guessed Unicode profile, logical length, UUID, or case policy. Metadata patches cannot convert existing encodings or repair data.

## Current implementation gaps

Source snapshot only, not a new five-database execution result:

- Builder delegates string/text creation to Knex. Current defaults are VARCHAR/TEXT on PostgreSQL and MySQL, a VARCHAR declaration/TEXT on SQLite, VARCHAR2/CLOB on Oracle, and NVARCHAR/NVARCHAR(MAX) on SQL Server. Oracle creation does not explicitly specify CHAR length semantics.
- Inspector currently merges most CHAR/NCHAR types into `string`, and its type union has no explicit `char` category. PostgreSQL classification uses the catalog name; `bpchar` currently falls through to `native`. Add exact dialect-aware matching rather than another broad prefix rule.
- `PhysicalColumnSchema` has `length`, but no dedicated length unit, charset, collation, or maximum-byte-capacity fields. These remain gaps independently of adding the `char` category.
- Oracle Inspector queries `CHAR_USED`, `CHAR_LENGTH`, and `DATA_LENGTH`, but the current public result/native-type formatting does not preserve the BYTE/CHAR distinction completely.
- SQL Server divides national-character byte capacity by two for `length`, but does not label the result as UTF-16 units. MySQL reads character maximum length without exposing charset, character collation, or octet length in the column result. The MySQL index catalog's `collation` A/D flag means index order, not character collation.
- SQLite declared length is currently exposed without a corresponding enforcement guarantee. Metadata type persistence alone cannot restore a limit after moving string storage to TEXT.

Sources: [Builder adapter](../../../src/schema/internal/knex/adapter.ts), [Inspector API](../../../src/schema/inspector/types.ts), [normalization](../../../src/schema/inspector/shared/type-normalization.ts), [Oracle Inspector](../../../src/schema/internal/knex/inspectors/oracle.ts), [MySQL Inspector](../../../src/schema/internal/knex/inspectors/mysql.ts), and [SQL Server Inspector](../../../src/schema/internal/knex/inspectors/mssql.ts).

## Decisions and verification before implementation

First specify Inspector `char/string/text` matching, SQLite enforcement representation, and Resolver/Repository handling for existing CHAR columns. Independently settle whether Collection should expose logical `char`; Inspector support alone must not add a Builder API. Then settle logical length units/defaults, Unicode prerequisites, the MySQL text tier, Oracle empty-string behavior, and NUL/invalid-Unicode policy before changing portable mappings or validation.

Tests should include ASCII, CJK, supplementary characters, combining sequences, exact/over-limit lengths, multi-byte overflow, fixed-width padding, trailing spaces, empty/null values, and case/accent-sensitive comparisons. Cover Inspector round trips, external columns, metadata lifecycle, unique constraints, filter/sort/distinct/cursor behavior, and LOB returning/streaming where supported. Report live-driver verification separately from catalog mocks or generated SQL.

Classification tests must distinguish PostgreSQL `bpchar` from internal `"char"`, CHAR/NCHAR from VARCHAR/NVARCHAR, and MAX/LOB types from bounded strings. Test shorter-than-width CHAR inputs and SQLite values exceeding a declared CHAR(n) width; exact-length application validation must not be inferred from either case.

No automatic charset conversion, collation migration, data rewrite, or historical migration edit is in scope. Do not present the candidate mappings as completed cross-database behavior in formal usage documentation.
