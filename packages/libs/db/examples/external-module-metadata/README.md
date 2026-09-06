# External Schema with Module Metadata

This example creates a physical CRM Schema outside `@nocobase/db`, then opens
it with:

```text
schemaManagement: external
ModuleCollectionMetadataStore
```

It demonstrates physical Schema inspection, supplemental titles and relations,
relation graph validation, record reads and writes, DDL rejection, and Module
Metadata write rejection.

Run it from the repository root:

```bash
pnpm --filter @nocobase/db example external
```

The result is retained under `examples/tmp/`, and the command prints its
absolute SQLite filename. To remove this run's result when the example
finishes, use cleanup mode:

```bash
pnpm --filter @nocobase/db example external --cleanup
```

External Schema management prevents Builder and Migration DDL. It does not
prevent QueryAdapter from reading and writing records. Module Metadata is
source-controlled and therefore read-only at runtime.
