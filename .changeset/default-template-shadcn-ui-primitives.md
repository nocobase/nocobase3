---
"@nocobase/app-template-default": patch
---

Ship the full shadcn/ui primitive set in `client/components/ui/`, adding 52 components from the registry alongside the existing nine, plus the `use-mobile` hook the sidebar depends on. Export `buttonVariants` from `button.tsx` for the primitives that compose it, and scope the ESLint exceptions the registry output needs to that directory.

Add the compositions shadcn documents without publishing to `client/components/`: `DataTable` with `DataTableColumnHeader`, `DataTablePagination` and `DataTableViewOptions` on TanStack Table, `DatePicker` and `DateRangePicker` on `Popover` and `Calendar`, and the `Typography*` prose primitives, with their strings in the application locales.

Add reference pages under `/dev`, declared with `defineDevRoutes()` so a production build drops them: an Examples group of complete business screens on mock data and a Components group with one page per shadcn/ui primitive, both sharing the frame in `client/pages/dev/shared.tsx`. The set ships page by page, so `client/routes.ts` declares a dev route only together with its page and the routes whose page does not exist yet stay commented out there.
