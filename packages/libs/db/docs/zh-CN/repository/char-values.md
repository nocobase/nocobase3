---
title: CHAR fields
description: Declare fixed-width CHAR fields, validate string inputs, and understand native padding, comparison, length units, and SQLite limitations.
---

# CHAR fields

```ts
c.char('code', { length: 8 }).notNull();
c.field({ name: 'region', type: 'char', length: 2 });
```

Length is required and must be a positive integer. Builder maps to PostgreSQL/MySQL `CHAR(n)`, Oracle `CHAR(n CHAR)`, SQL Server `NCHAR(n)`, and SQLite `CHAR(n)` declarations. Inspector and Resolver retain logical `char`; explicit UUID metadata can still restore UUID semantics over compatible CHAR storage.

Repository accepts well-formed strings without NUL, rejects overlong inputs, and accepts SQL NULL only when nullable. It does not stringify, trim, or pad values. Defaults must be strings within the declared character count. Database-specific byte ceilings still apply; SQL Server length counts UTF-16 units, while native Oracle BYTE declarations retain their byte limitations. This is not a new portable Unicode code-point length policy for other string types.

Native semantics remain visible. PostgreSQL, Oracle, and SQL Server can return space-padded strings; MySQL normally strips CHAR trailing spaces. SQLite has no native fixed-width padding or length enforcement; Repository enforces the declared maximum on its writes and reads. Direct SQL bypasses application validation. An empty string may become SQL NULL on Oracle. Do not use CHAR when trailing spaces must distinguish identifiers portably.

Use the string Filter Builder for CHAR fields. Equality, patterns, sorting, distinct, grouping, supported aggregates, cursors, unique selectors, and mutation returning use existing Repository APIs. Oracle default equality binds a CHAR-typed operand to avoid a VARCHAR binding changing native blank-padding comparison. Pattern and case-insensitive comparisons retain native database behavior.

```ts
await codes.createOne({ values: { code: 'AB' } });
await codes.findMany({
  filter: (f) => f.string('code').eq('AB'),
  select: (s) => s.fields('code'),
});
```

Outputs are not guaranteed to have the same trailing spaces on every database. Existing schemas and data are not automatically converted. Altering a CHAR length remains a physical schema operation subject to native limits and existing data.
