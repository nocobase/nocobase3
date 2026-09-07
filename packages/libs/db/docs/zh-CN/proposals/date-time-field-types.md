---
title: Date and time field type mappings
description: Finalized V1 mappings for date, time, datetime, and datetimeTz across five databases, with metadata, inspection, value boundaries, and validation history.
---

# Date and time field type mappings

Status: V1 implemented and validated on 2026-09-06 within the boundaries below. This is the design record; use the [formal temporal guide](../repository/temporal-values.md) for the supported public API.

## Logical types

| Collection field type | Meaning                                                      | Illustrative value                                                |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `date`                | Calendar date without time or time zone                      | `2026-09-06`                                                      |
| `time`                | Time of day without date or time zone; not a duration        | `09:30:00`                                                        |
| `datetime`            | Local date and time without time zone; not a unique instant  | `2026-09-06T09:30:00`                                             |
| `datetimeTz`          | An instant identified by an offset or UTC, normalized to UTC | `2026-09-06T09:30:00+08:00`, equivalent to `2026-09-06T01:30:00Z` |

`datetimeTz` does not promise to preserve the original offset or named time zone. Store a separate `timeZone` field when business logic needs a name such as `Asia/Shanghai`.

## Recommended physical mappings

`p` denotes fractional-second precision. V1 uses `p = 3` for newly created time and date-time fields, with no configurable precision option. Inspection still reports the real precision of existing columns, including values above three. This does not authorize lossy reads of those columns.

| Collection field type | PostgreSQL                                    | MySQL                                | SQLite                            | Oracle                         | SQL Server          |
| --------------------- | --------------------------------------------- | ------------------------------------ | --------------------------------- | ------------------------------ | ------------------- |
| `date`                | `DATE`                                        | `DATE`                               | `TEXT`, canonical date            | `DATE`, restricted to midnight | `DATE`              |
| `time`                | `TIME(p) WITHOUT TIME ZONE`                   | `TIME(p)`, restricted to time of day | `TEXT`, canonical time            | `VARCHAR2(18)`, canonical time | `TIME(p)`           |
| `datetime`            | `TIMESTAMP(p) WITHOUT TIME ZONE`              | `DATETIME(p)`                        | `TEXT`, canonical local date-time | `TIMESTAMP(p)`                 | `DATETIME2(p)`      |
| `datetimeTz`          | `TIMESTAMP(p) WITH TIME ZONE` (`timestamptz`) | `DATETIME(p)`, UTC convention        | `TEXT`, canonical UTC date-time   | `TIMESTAMP(p) WITH TIME ZONE`  | `DATETIMEOFFSET(p)` |

### Mapping boundaries

- **PostgreSQL:** plain `timestamp` is without time zone. `timestamptz` represents an instant, but does not retain the original named time zone or offset; displayed values depend on the session time zone.
- **MySQL:** prefer UTC-normalized `DATETIME(p)` for `datetimeTz`, rather than `TIMESTAMP(p)`, to avoid the latter's narrower date range and implicit session-time-zone conversions. This requires explicit UTC encoding and decoding, not merely a column declaration. `TIME` also supports negative values and durations beyond 24 hours; the logical `time` type must reject those values.
- **SQLite:** use explicit text storage and a canonical, fixed-width format per field, including consistent fractional seconds. Normalize every instant to UTC before storage so lexical ordering can agree with chronological ordering within the supported format and range. Declaring a text column alone does not enforce this contract.
- **Oracle:** `DATE` includes hours, minutes, and seconds; logical `date` needs a date-only invariant. Oracle has no standalone SQL time-of-day type, so propose canonical text for `time`. `VARCHAR2(18)` accommodates `HH:mm:ss` plus up to nine fractional digits; this storage capacity does not decide the portable precision. Prefer explicit `WITH TIME ZONE` over `WITH LOCAL TIME ZONE` for the new instant mapping, while normalizing inputs and outputs to UTC.
- **SQL Server:** use `DATETIME2` for local date-time and `DATETIMEOFFSET` for instants. Do not use `timestamp`: it is a synonym for `rowversion`, not a temporal type.

Application validation is required for logical restrictions. Automatic physical check constraints for direct SQL writers are deferred. Native time-zone-aware storage in Oracle and SQL Server may retain offsets, but the portable API deliberately does not promise offset preservation.

## Current implementation, before this proposal

The following mappings are based on the current schema adapter and installed Knex dialect compilers, not a new five-database execution test.

| Collection field type | PostgreSQL           | MySQL                | SQLite                 | Oracle (`oracledb`)              | SQL Server           |
| --------------------- | -------------------- | -------------------- | ---------------------- | -------------------------------- | -------------------- |
| `date`                | `date`               | `date`               | `date` declaration     | `date`                           | `date`               |
| `time`                | `time`               | `time`               | `time` declaration     | `varchar2(16)`                   | `time`               |
| `datetime`            | `timestamptz`        | `datetime`           | `datetime` declaration | `timestamp with local time zone` | `datetime2`          |
| `datetimeTz`          | No dedicated mapping | No dedicated mapping | No dedicated mapping   | No dedicated mapping             | No dedicated mapping |

SQLite declarations above do not provide native temporal storage semantics. The current `datetime` mapping is not consistently time-zone-free: PostgreSQL and Oracle need an explicit change. The inspector currently merges several timestamp variants into `datetime`; updating creation without updating inspection and logical metadata would lose the distinction. MySQL and SQLite particularly require logical metadata because the proposed physical storage alone cannot distinguish `datetime` from `datetimeTz`.

Source references: [field definitions](../../../src/collection/types.ts), [schema adapter](../../../src/schema/internal/knex/adapter.ts), and [physical type normalization](../../../src/schema/inspector/shared/type-normalization.ts).

## V1 value boundary

| Type         | Accepted non-null input                                                                 | Canonical output                              |
| ------------ | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| `date`       | Valid `YYYY-MM-DD` string                                                               | `YYYY-MM-DD`                                  |
| `time`       | `HH:mm:ss` with optional one to three fractional digits                                 | `HH:mm:ss.SSS`                                |
| `datetime`   | Date and time separated by `T`, with optional one to three fractional digits, no offset | `YYYY-MM-DDTHH:mm:ss.SSS`                     |
| `datetimeTz` | Date-time string with `Z` or explicit `±HH:mm` offset, or a valid JavaScript `Date`     | `YYYY-MM-DDTHH:mm:ss.SSSZ`, normalized to UTC |

- Reject invalid calendar dates, leap seconds, `24:00:00`, durations, implicit-zone instants, and strings with more than three fractional digits. Never silently truncate or round. Zone-free types reject JavaScript `Date`.
- Use years 1000 through 9999 for the portable V1 contract, inclusive. Validate the UTC result of offset conversion as well. Existing native columns may have narrower limits, such as MySQL `TIMESTAMP`; reject unsupported values before execution where the column capabilities are known. Do not extend native column ranges by declaration alone.
- `null` follows field nullability. Nullable values do not bypass type validation for other inputs.
- Do not expose an already truncated driver `Date` as a successful high-precision read. Existing columns require lossless driver retrieval or an explicit unsupported-precision error before reading; configurable microsecond/nanosecond codecs are outside V1.
- Apply the same conversion to values, unique selectors, filters, cursors, aggregates, relation projections, and returning. Direct Query/SQL writers remain physical APIs and must obey the storage convention themselves.
- Session and driver configuration must be deliberate and tested under different host and database time zones. Do not silently rewrite unrelated connection settings. Temporal schema defaults must use the same convention; arbitrary SQL defaults and external writers are not automatically repaired. Automatic check constraints are deferred.

## Metadata and inspection contract

Persist every explicitly declared scalar logical type in field metadata, not only ambiguous temporal types. Normalize `increments` to `integer`; auto-increment and primary keys remain physical structure. Relations remain in relation metadata. Preserve explicitly declared native/custom types without pretending they are supported temporal codecs.

Metadata is authoritative for declared semantics; Inspector is authoritative for physical structure. Resolver must validate compatibility before adopting metadata, report schema drift for incompatible columns, and conservatively infer types when metadata is absent. Creation, alteration, and removal must maintain metadata consistently. Temporal aliases that have native semantics must not be accepted merely because both names contain `time`.

| Native column                                                          | Inspector target `dataType`                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| PostgreSQL `timestamptz`                                               | `datetimeTz`                                                                     |
| MySQL `timestamp`                                                      | `datetimeTz`                                                                     |
| Oracle `timestamp with time zone` and `timestamp with local time zone` | `datetimeTz`                                                                     |
| SQL Server `datetimeoffset`                                            | `datetimeTz`                                                                     |
| Zone-free timestamps/date-times, including Oracle `DATE`               | `datetime`                                                                       |
| PostgreSQL `timetz`                                                    | `native`, not zone-free `time`                                                   |
| SQLite ordinary text/numeric columns                                   | Preserve physical classification; never inspect data to guess temporal semantics |

Always retain `nativeType`. Add `fractionalSecondsPrecision` as a physical column property distinct from numeric `precision` and `scale`. Native offset/region retention remains distinguishable through `nativeType`; the portable `datetimeTz` contract does not preserve that information. A MySQL `DATETIME` or SQLite text column requires metadata to become a logical `datetimeTz`. Existing SQLite temporal declarations remain declaration-based classifications, not proof of stored-value validity.

## Implementation stages

1. Finalize this baseline; implement and test Inspector temporal classification and precision extraction independently.
2. Complete field types, Builder helpers, physical mappings, metadata lifecycle, and Resolver compatibility. Do not publish a new type as fully supported before Repository wiring is ready.
3. Implement temporal codecs and Repository paths, validate supported drivers and consumers, and update formal usage documentation. Report unavailable live databases separately from passing tests.

Progress: Inspector, metadata, Builder, Resolver, and V1 Repository codecs are implemented. Five-database temporal integration checks and a non-UTC Node-host run pass. PostgreSQL/MySQL Repository regression and Oracle/SQL Server Schema/Builder plus selected Repository regression pass. Formal usage is documented in [date and time values](../repository/temporal-values.md).

Implementation findings: Oracle `TIMESTAMP WITH TIME ZONE` cannot be a primary/unique constraint column; new table declarations reject it before DDL. Oracle temporal bulk insertion uses individual inserts within one transaction to avoid Knex double-conversion. SQL Server projections require canonical fractional-second padding. Temporal relation join keys are explicitly unsupported in V1; ordinary temporal relation values and projections are supported. Native intervals previously matched the broad integer prefix; inspection now keeps them native. Metadata-backed renames still require atomic Store/DDL support and remain rejected by the existing guard. Existing persisted schemas are not automatically migrated, and historical migrations are not rewritten.

Keep this proposal separate from the deferred [BigInt and Decimal transport proposal](./precise-numeric-values.md). Update formal usage documentation only after the corresponding behavior is implemented and verified.
