---
title: JSON fields and JSONB storage preference
description: Proposed JSON fields with a top-level jsonb preference, five-database fallback rules, physical inspection, metadata ownership, and pending value contracts.
---

# JSON fields and JSONB storage preference

Status: design proposal, not an implemented cross-database contract. Recorded on 2026-09-06. No runtime changes accompany this document. The top-level `jsonb` preference is the selected API direction; remaining value, version, and migration decisions are identified below.

## Decision summary

| State                           | Contract                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected direction              | One logical `json` type; top-level boolean `jsonb`; PostgreSQL defaults to JSON and selects JSONB explicitly; other databases retain supported default storage                                     |
| Recommended baseline, not final | JSON values rather than source text, strict serialization without implicit conversions, conflict rejection for incompatible native overrides, and no automatic data conversion on unrelated alters |
| Implementation gates            | Public SQL-NULL/JSON-null representation, top-level scalar policy, Oracle storage/version policy, budgets, and explicit JSON/JSONB conversion rules                                                |

This document owns physical JSON representation and codecs. The [enum/set proposal](./enum-set-field-types.md) reuses the JSON backend on four databases but defines a narrower string-set contract; PostgreSQL set storage remains TEXT arrays regardless of JSONB preferences.

## Logical type and declaration

Keep one Collection logical type, `json`. JSONB is a physical storage choice, not another portable value type. The API represents JSON values, not original JSON source text; it does not promise preservation of whitespace, object key order, duplicate keys, or numeric spelling. Store original source separately as text when signatures or archival fidelity require it.

Proposed API, not currently implemented:

```javascript
c.field({
  name: 'settings',
  type: 'json',
  jsonb: true,
  nullable: true,
});

c.json('settings', { jsonb: true });
```

`jsonb` is a JSON-specific boolean parameter at the field definition's top level, not under `db`. Reject non-boolean values and its use on unrelated field types through both TypeScript and runtime validation. Do not assume it applies to logical `set` merely because some set backends use JSON.

| Parameter          | Proposed behavior                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Omitted or `false` | Use the dialect's default JSON mapping; PostgreSQL uses JSON                                   |
| `true`             | Prefer an explicitly supported JSONB mapping; otherwise use the dialect's default JSON storage |

This supersedes the earlier suggestion that PostgreSQL JSONB should be the unconditional default. `false` does not require textual internal storage: MySQL JSON, for example, remains internally binary.

## Five-database mapping direction

| Database   | Default / `jsonb: false`                                                        | `jsonb: true`                                                             |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| PostgreSQL | `JSON`                                                                          | `JSONB`                                                                   |
| MySQL      | Native `JSON`                                                                   | Same native `JSON`; no separate JSONB switch                              |
| SQLite     | Proposed `TEXT` with JSON validity checks                                       | Same default; do not automatically enable SQLite JSONB                    |
| Oracle     | Native JSON or a supported JSON text/LOB representation; version policy pending | Same supported default                                                    |
| SQL Server | SQL Server 2022 baseline: `NVARCHAR(MAX)` with JSON validity checks             | Same default; newer native JSON support needs separate version adaptation |

SQLite JSONB is a SQLite-specific binary format, not PostgreSQL JSONB. It requires version checks, binding/decoding, and query validation; matching names do not justify enabling it with this preference. Oracle's native JSON and MySQL binary JSON also do not imply PostgreSQL operators or indexes.

Only an unsupported storage preference may fall back. Do not catch arbitrary DDL errors and silently retry another type. If JSON storage itself is unsupported, report that limitation. Explicit JSONB-only operators or index requests still require capability validation and must not be silently omitted. Builder planning/results should reveal the effective physical type; a request containing `jsonb: true` is not proof that the database used JSONB.

An explicit `db.nativeType` override combined with `jsonb` needs a rule before implementation. Recommended behavior is to reject contradictory explicit choices rather than silently select a winner. Preference handling for creation and alteration must be distinct: omission on an unrelated alter must not convert an existing JSONB column back to JSON.

### Creation, alteration, and fallback

Recommended operation rules, pending implementation review:

| Operation                                            | Expected treatment                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Create PostgreSQL JSON field, flag omitted/false     | Plan JSON                                                                                       |
| Create PostgreSQL JSON field, flag true              | Plan JSONB                                                                                      |
| Create other-database JSON field, flag true          | Resolve to supported default JSON storage before DDL; expose effective type                     |
| Alter unrelated properties, flag omitted             | Preserve current storage; omission is not false in a patch                                      |
| Alter PostgreSQL JSON/JSONB with explicit flag       | Plan a conversion only when target differs; preflight data, defaults, indexes, and dependencies |
| Alter other-database JSON field with flag true/false | No storage conversion solely due to the flag                                                    |
| Invalid flag or flag on enum/set/another type        | Validation error before executing DDL                                                           |

Fallback must not invent an index, suppress a DDL/permission error, or change an existing column merely to match a default. Desired-schema comparisons must compare the effective dialect mapping, not endlessly propose a change because a MySQL JSON column cannot report JSONB. A full schema declaration and an alter patch need different omission semantics; preserve that distinction in migration planning.

## PostgreSQL JSON versus JSONB

| Capability                            | JSON                                        | JSONB                                                             |
| ------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Stored representation                 | Validated original JSON text                | Parsed binary representation                                      |
| Whitespace, key order, duplicate keys | Preserved in stored text                    | Original formatting/order not preserved; duplicate keys collapsed |
| Repeated structural queries           | Requires parsing                            | Supports richer structural operations                             |
| Indexing                              | Expression indexes on extracted values      | Expression indexes and applicable GIN indexes                     |
| Comparison/containment                | Fewer direct operators; casts may be needed | Broader operators, not a cross-database guarantee                 |

Changing JSON to JSONB is a data conversion, not just a metadata toggle. It may change duplicate-key handling and reject values JSONB cannot represent, including values outside supported numeric/Unicode constraints. Define migration preflight and dependency handling before enabling alteration; switching back cannot recover lost source formatting or duplicate keys.

## Inspector and metadata

Inspector retains real storage, for example these column projections:

```javascript
{ dataType: 'json', nativeType: 'json' }
{ dataType: 'json', nativeType: 'jsonb' }
```

Preserve `nativeType` to distinguish capabilities; do not fabricate a JSONB result from the requested flag. Native MySQL/Oracle JSON should be identified through actual catalog support. Ordinary text/LOB columns remain physical text/string categories with constraints reported separately; logical JSON can be restored through metadata. SQLite JSON declarations are declaration-based information, and arbitrary BLOB data is not automatically recognizable as JSONB from the column alone.

Persist logical `fields.settings.type = 'json'` using the existing metadata mechanism. The effective physical JSON/JSONB choice is inspector-owned, so the flag need not be duplicated as authoritative runtime metadata. Portable source definitions can retain the requested preference for replay, but runtime resolution must consult actual storage. Export/reconstruction semantics should not claim to recover an ignored preference from a MySQL JSON column.

Resolver checks representation and codec compatibility before adopting metadata. A type patch does not validate existing JSON documents or add a missing physical CHECK. Preserve constraint expressions and enforcement details where supported; do not guess logical JSON by sampling rows or loosely matching SQL text.

## Value and NULL boundaries to finalize

These decisions are required before the proposal becomes an implementation baseline:

| Topic                     | Required decision                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level values          | Objects/arrays only, or all JSON values including strings, numbers, booleans, and JSON null; database checks must match the chosen domain                                                 |
| SQL NULL versus JSON null | Assign unambiguous public input/output representations; `nullable` governs SQL NULL, not nested JSON null                                                                                 |
| Serialized strings        | Recommended: a JS string is a JSON string value, never automatically parsed as a document; any raw-document input needs an explicit separate contract                                     |
| Non-JSON JS values        | Recommended: reject undefined values, sparse arrays, bigint, functions, symbols, non-finite numbers, cycles, and implicit Date/class serialization rather than silently transforming them |
| Resource limits           | Bound encoded size, depth, and query/path complexity without assuming the same physical limit in every database                                                                           |
| Numeric precision         | JSONB does not prevent JS number precision loss; reuse the boundaries of the [exact-number proposal](./precise-numeric-values.md), not an implicit stringification policy                 |

Distinguish missing object keys, nested JSON null, a top-level JSON null document, and SQL NULL in reads and filters. Do not invent a null sentinel API in examples before deciding its representation. Defaults, variables, and mutation literal wrappers must follow the same contract, without accidentally interpreting JSON object contents as Repository expressions.

JSON checks vary in accepted top-level scalars and syntax strictness by database/version. A check that accepts only objects/arrays cannot enforce a contract promising arbitrary JSON values. Unicode/NUL restrictions and duplicate-key behavior also require a portable accepted domain; accepting JSON syntax alone is not enough.

### Null and path state matrix

Keep the following physical states distinct until the public representation is finalized:

| State                      | Meaning                     | Codec/query requirement                                      |
| -------------------------- | --------------------------- | ------------------------------------------------------------ |
| SQL NULL column            | No document                 | Check independently of JSON extraction                       |
| Top-level JSON null        | A present JSON null value   | Must not silently collapse into SQL NULL if both are exposed |
| Missing object key         | Path does not exist         | Existence is false                                           |
| Present key with JSON null | Path exists with null value | Existence is true; JSON type is null                         |
| Present string `'null'`    | A string, not a null value  | Preserve type during comparison and extraction               |

A driver may decode SQL NULL and a JSON null document to the same JavaScript null. SQL-null flags or typed projections may be necessary before decoding, including nested relation and returning paths. Do not choose a public API that claims to distinguish states after the distinguishing information has already been lost. SQL Server scalar extraction, for example, can return SQL NULL for multiple path states; an existence/type-aware query must not rely on that extraction alone.

JSON null inside an object/array does not violate column NOT NULL. A missing mutation property is also not a stored JSON null: omission follows Repository mutation semantics. Explicit undefined inside a supplied JSON document is a serialization issue, not field omission. If only objects/arrays are chosen for V1, explicitly reject unsupported top-level scalars/documents rather than silently coercing them.

### Shared encoding and validation sequence

Resolve Repository variables/literal wrappers at the defined boundary, validate the logical value, encode once for the dialect, then bind parameters. On reads, preserve SQL-null/type information, decode once, and validate before exposing the value. Do not parse a decoded JSON string a second time just because it looks like JSON source. Do not invoke arbitrary `toJSON()` methods or getters as a validation strategy; the supported plain-data object shape needs an explicit rule.

Limits must apply before unbounded traversal/serialization, and to incoming database documents where feasible. Never trim or truncate oversized documents to make them fit. Existing numerically lossy documents cannot be repaired by changing JSON to JSONB or serializing an already rounded JavaScript number as text.

## Query and index boundaries

- Define path existence, JSON null, SQL NULL, scalar extraction types, numeric comparison, and array containment independently. Parameterize paths/values through supported dialect expressions rather than interpolating user strings.
- Preserve array order and duplicates for ordinary JSON. The [set proposal](./enum-set-field-types.md) adds separate collection semantics and uses PostgreSQL TEXT arrays, not this JSONB preference.
- Do not promise whole-document equality, sort, distinct, grouping, or aggregation merely because one backend supports them. Explicitly specify supported operations and dialect fallbacks or rejection.
- JSONB can enable PostgreSQL GIN-backed queries, but `jsonb: true` does not automatically create indexes. Cast-based JSON queries may require matching expression indexes; changing a column does not guarantee a faster plan.
- MySQL multi-valued indexes, Oracle JSON indexes, SQL Server computed/native JSON indexes, and SQLite expression indexes have different version and expression requirements. Report capability and performance separately from functional correctness.

## Current implementation and staged work

At drafting time, Builder calls `table.json()` without a top-level JSONB preference. Installed Knex uses PostgreSQL JSON, MySQL JSON, SQLite `json` declarations, Oracle `oracledb` VARCHAR2(4000) plus IS JSON, and SQL Server NVARCHAR(MAX). Oracle's current 4,000-unit declaration is a capacity concern, not the proposed general JSON limit. Inspector normalization groups JSON/JSONB under `json`; scalar metadata already stores the logical type. These facts do not prove complete validation, scalar/NULL parity, or index support.

Sources: [field definitions](../../../src/collection/types.ts), [Builder adapter](../../../src/schema/internal/knex/adapter.ts), [Inspector normalization](../../../src/schema/inspector/shared/type-normalization.ts), [metadata](../../../src/metadata/document.ts), and [Repository execution](../../../src/repository/internal/knex-execution-adapter.ts).

1. Finalize the value/NULL domain, Oracle storage policy, preference conflicts, resource limits, and alteration rules.
2. Add the JSON-only parameter, explicit mappings, physical inspection/Resolver checks, and visible fallback behavior.
3. Validate codecs, defaults, filters, nested projections, returning, and streaming/LOB behavior using the shared contract and dialect-specific capabilities. Reuse transport infrastructure for JSON-backed sets without inheriting their sorting/deduplication/member normalization.
4. Test requested versus effective mappings, PostgreSQL JSON and JSONB, non-PostgreSQL fallback, invalid parameters, large/deep documents, Unicode, scalar/null distinctions, malformed external data, and migration failure safety. Test index plans only for explicitly supported cases.

Report actual live database coverage separately from SQL-generation and mocked-catalog tests. Do not silently migrate data, alter collation/connection settings, rewrite historical migrations, or advertise candidate behavior in formal usage docs before verification.

## Paired acceptance checks with enum/set

- A duplicate-bearing ordered array remains ordinary JSON, while the same value is rejected for logical set; set reordering does not change equality.
- Public set null maps to SQL NULL; a stored JSON null document is not a valid set. Generic JSON uses the separately chosen public null contract.
- JSON-looking strings remain strings when top-level scalar strings are supported, not parsed documents or comma-separated set members.
- JSONB true on a non-PostgreSQL JSON field has the same logical result as default storage; it is invalid on a set field. A title-only alteration preserves an existing PostgreSQL JSONB column.
- Definition validation failures leave both DDL and metadata unchanged. Data conversion and member evolution follow their explicit migration protocol, not ordinary metadata assignment.
- Tests retain array order/duplicates for JSON and cover NULL-sensitive empty-set predicates across PostgreSQL arrays and the four JSON backends. Repeated schema planning must not report phantom JSONB differences on fallback dialects.
