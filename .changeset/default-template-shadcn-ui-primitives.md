---
"@nocobase/app-template-default": patch
---

Ship the full shadcn/ui primitive set in `client/components/ui/`, adding 52 components from the registry alongside the existing nine, plus the `use-mobile` hook the sidebar depends on. Export `buttonVariants` from `button.tsx` for the primitives that compose it, and scope the ESLint exceptions the registry output needs to that directory.

Add the compositions shadcn documents without publishing to `client/components/`: `DataTable` with `DataTableColumnHeader`, `DataTablePagination` and `DataTableViewOptions` on TanStack Table, `DatePicker` and `DateRangePicker` on `Popover` and `Calendar`, and the `Typography*` prose primitives, with their strings in the application locales.
