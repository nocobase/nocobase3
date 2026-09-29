---
'@nocobase/app-template-default': patch
'@nocobase/app-template-hub': patch
'@nocobase/app-template-examples': patch
---

The `DataTable` set moves into one directory, `client/components/data-table/`, instead of four sibling files: `DataTable` becomes `index.tsx`, so `@/components/data-table` still resolves, and `DataTableColumnHeader`, `DataTablePagination` and `DataTableViewOptions` become `column-header.tsx`, `pagination.tsx` and `view-options.tsx` beside it.

An application generated earlier moves the four files the same way and rewrites the companion imports: `@/components/data-table-column-header` becomes `@/components/data-table/column-header`, `@/components/data-table-pagination` becomes `@/components/data-table/pagination`, and `@/components/data-table-view-options` becomes `@/components/data-table/view-options`. An import of `DataTable` itself needs no change.
