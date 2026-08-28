# Workflow Management Registry Item

This Registry item's canonical recipe is published by
`@nocobase/app-plugin-workflow`. It provides editable Workflow Management
pages and a read-only workflow canvas for compatible applications.

The item may use only stable public exports from
`@nocobase/app-plugin-workflow` and `@nocobase/app-plugin-workflow/client`. The
plugin continues to own workflow authoring, validation, persistence, runtime
execution, queue integration, and HTTP APIs. Do not copy those contracts into
this directory.

Once materialized under
`client/extensions/nocobase-workflow-management`, the application owns the
resulting source and may edit its page composition. Plugin upgrades do not
overwrite application-owned UI; update an installed copy with an explicit
three-way merge.
