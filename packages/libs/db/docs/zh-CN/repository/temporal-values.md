---
title: Date and time values
description: Declare date, time, datetime, and datetimeTz fields and use canonical temporal values across Repository mutations, filters, projections, and five databases.
---

# Date and time values

Use `datetime` for local calendar components and `datetimeTz` for an instant. The latter normalizes to UTC and does not preserve an original offset or named time zone.

| Logical type | Accepted input                                                                           | Returned value                     |
| ------------ | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| `date`       | `YYYY-MM-DD`                                                                             | `YYYY-MM-DD`                       |
| `time`       | `HH:mm:ss`, optionally with one to three fractional digits                               | `HH:mm:ss.SSS`                     |
| `datetime`   | `YYYY-MM-DDTHH:mm:ss`, optionally with one to three fractional digits, without an offset | `YYYY-MM-DDTHH:mm:ss.SSS`          |
| `datetimeTz` | Date-time with `Z` or `±HH:mm`, or a valid JavaScript `Date`                             | `YYYY-MM-DDTHH:mm:ss.SSSZ`, in UTC |

V1 accepts years 1000–9999, valid calendar dates, and times from `00:00:00.000` through `23:59:59.999`. Reject invalid dates, leap seconds, `24:00:00`, negative durations, more than three fractional digits, and implicit-zone instants. Offset magnitudes may not exceed `14:00`; `-00:00` (unknown offset) is rejected. UTC conversion must also stay within the year range. The three zone-free types do not accept JavaScript `Date`.

```ts
await builder.createCollection('events', (c) => {
  c.string('code').primary();
  c.field({ name: 'day', type: 'date', nullable: true });
  c.field({ name: 'localStartAt', type: 'datetime', nullable: true });
  c.field({ name: 'occurredAt', type: 'datetimeTz', nullable: false });
});

const events = db.repository('events');
await events.createOne({
  values: {
    code: 'event-1',
    day: '2026-09-06',
    localStartAt: '2026-09-06T09:30:00',
    occurredAt: '2026-09-06T09:30:00+08:00',
  },
});

await events.findMany({
  filter: (f) => f.date('occurredAt').before('2026-09-06T02:00:00Z'),
  select: (s) => s.fields('localStartAt', 'occurredAt'),
});
// [{ localStartAt: '2026-09-06T09:30:00.000', occurredAt: '2026-09-06T01:30:00.000Z' }]
```

`date()` Filter Builder operators also apply to `datetime` and `datetimeTz`; `on/notOn` remain date-only. AST `$eq/$ne` support temporal equality, including unique-selector workflows. Root equality shorthand remains unavailable for date/date-time fields. `between` uses a half-open interval `[start, end)`. Values variables use the same validation as literal values.

## Physical storage and metadata

| Type         | PostgreSQL                       | MySQL                         | SQLite                 | Oracle                        | SQL Server          |
| ------------ | -------------------------------- | ----------------------------- | ---------------------- | ----------------------------- | ------------------- |
| `date`       | `DATE`                           | `DATE`                        | `TEXT`                 | `DATE`, date-only convention  | `DATE`              |
| `time`       | `TIME(3)`                        | `TIME(3)`                     | `TEXT`                 | `VARCHAR2(18)`                | `TIME(3)`           |
| `datetime`   | `TIMESTAMP(3) WITHOUT TIME ZONE` | `DATETIME(3)`                 | `TEXT`                 | `TIMESTAMP(3)`                | `DATETIME2(3)`      |
| `datetimeTz` | `TIMESTAMP(3) WITH TIME ZONE`    | `DATETIME(3)`, UTC convention | `TEXT`, UTC convention | `TIMESTAMP(3) WITH TIME ZONE` | `DATETIMEOFFSET(3)` |

Builder saves every explicitly declared scalar logical type in metadata. Inspector describes physical storage independently; Resolver validates compatibility and merges the declaration. MySQL `DATETIME` and SQLite `TEXT` cannot identify UTC semantics without metadata. Native MySQL `TIMESTAMP`, PostgreSQL `timestamptz`, Oracle time-zone timestamps, and SQL Server `datetimeoffset` are inspected as `datetimeTz` without requiring metadata.

## Boundaries

- V1 Repository relations require non-temporal join keys. Temporal fields inside related records, relation-local pagination, and combine projections are supported; using a temporal field itself as `sourceKey`, `targetKey`, or the corresponding foreign key is explicitly rejected pending complete association encoding support.

- Newly created temporal columns use millisecond precision. Inspector exposes `fractionalSecondsPrecision` separately from numeric `precision/scale`. Repository rejects selected native temporal columns with precision above three before driver parsing can lose information; selecting only other fields remains possible. Values exceeding a known lower column precision are rejected rather than truncated.
- Native column limits still apply. MySQL `TIMESTAMP` uses its narrower 1970–2038 range; the default `DATETIME` mapping supports later instants. Oracle `TIMESTAMP WITH TIME ZONE` cannot be a primary or unique constraint column; Builder rejects these constraints on new tables before DDL.
- Legacy SQL Server `DATETIME` accepts its native year range and millisecond spellings ending in `0`, `3`, or `7`; other values are rejected to avoid native rounding. `SMALLDATETIME` requires whole minutes within its native range. New declarations use `DATETIME2(3)` instead.
- SQL formatting and binding preserve local components or UTC meaning without changing global driver parsers. Canonical output is used by ordinary and nested projections, mutation returning, streaming, and temporal min/max results.
- Raw Query/SQL, imports, and schema defaults are physical interfaces: they must follow the same storage convention. Metadata does not transform existing rows or add physical check constraints. Do not write unnormalized text into SQLite temporal columns.
- These changes do not migrate existing databases. Inspect and explicitly migrate any existing zone-bearing column previously declared as `datetime` before adopting the new zone-free declaration.

The [design record](../proposals/date-time-field-types.md) contains rationale and staged validation history, not additional public capabilities.
