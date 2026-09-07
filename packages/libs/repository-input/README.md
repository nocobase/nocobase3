# `@nocobase/repository-input`

Portable Repository input contracts and builders shared by `@nocobase/db` and
`@nocobase/api-client`. This package has no database, Node.js runtime, React,
or HTTP dependencies. It constructs data; the server owns schema validation,
authorization, variable resolution, and execution.

```ts
import {
  buildFilter,
  buildSelect,
  buildSort,
  buildAggregate,
} from '@nocobase/repository-input';

const filter = buildFilter((f) => f.string('status').eq('paid'));
const select = buildSelect((s) =>
  s
    .fields('id')
    .include('tasks', (t) =>
      t.fields('title').filter((f) => f.number('points').gte(2)),
    ),
);
const sort = buildSort((s) => s.field('createdAt').desc());
const aggregate = buildAggregate((a) => ({ count: a.count() }));
```

Each helper accepts its AST form as well as a synchronous callback and returns
a detached JSON snapshot. `buildFilter` additionally accepts scalar equality
shorthand. Nested selections, including `combine` branches, recursively
materialize their filter and sort inputs. Collection names are optional and
are not inferred from relation names.

`buildCreateValues` and `buildUpdateValues` materialize whole-values and
field-level mutation callbacks. Numeric operations and relation operations
retain the server's existing syntax. Nested relation creations carrying a
`clientKey` use `{ kind: 'relationCreate', version: 1, values, clientKey,
through? }`; creations without it retain plain values or `{ values, through }`.
Plain JSON field data is preserved. Functions in unsupported data positions,
async callbacks, circular data, invalid dates, and non-finite numbers fail
locally. Dates become ISO strings and bigints become decimal strings.

Use the `build*Options` helpers exported by `@nocobase/api-client` for complete
remote Repository requests. The `internal/*` entry points exist for the
framework's shared implementation and should not be used by application code.
