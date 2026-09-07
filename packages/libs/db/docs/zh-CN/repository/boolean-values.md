---
title: Boolean values
description: Strict boolean Repository inputs, cross-database output decoding, variables, filters, and errors for invalid stored values.
---

# Boolean values

A resolved logical `boolean` field accepts `true` and `false`. It accepts `null` only when nullable and not a primary key. Public inputs such as `1`, `0`, `'true'`, and `'false'` raise `INVALID_MUTATION`; they are not coerced.

```ts
await flags.createOne({ values: { code: 'A', enabled: true } });

await flags.updateOne({
  filter: { code: 'A' },
  values: (v) => ({ enabled: v.variable('$enabled') }),
  context: { enabled: false },
  select: (s) => s.fields('code', 'enabled'),
});

await flags.findMany({
  filter: { enabled: true },
  select: (s) => s.fields('code', 'enabled'),
});
```

Repository results contain booleans, not driver-specific integers. This applies to reads, mutation returning, nested projections, group keys, distinct, and streamed rows. Internally, recognized numeric-backed representations are converted from exact 0/1 values. Arbitrary truthy values and BIT buffers are not accepted.

Boolean fields support sorting, grouping, and `count`, but not value aggregates (`sum`, `avg`, `min`, or `max`). Those requests raise `FIELD_CAPABILITY_NOT_SUPPORTED`; numeric-backed storage does not make logical booleans numeric aggregate operands.

If an externally managed boolean column contains an invalid value such as `2`, selecting it raises `INVALID_STORED_VALUE` with the field name and selection path. Fix the source data explicitly; Repository does not silently clean it up. Ordinary integer fields and numbers inside JSON retain their original semantics.

Inspector does not infer a logical boolean merely from MySQL `TINYINT(1)` or Oracle `NUMBER(1,0)`. Ambiguous storage needs explicit compatible field metadata. Metadata does not validate existing rows or install CHECK constraints. See the [boolean field proposal](../proposals/boolean-field-type.md) for physical mappings and constraint implementation status.
