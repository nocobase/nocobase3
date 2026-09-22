---
'@nocobase/app-template-default': patch
---

Ship the full shadcn/ui primitive set in `client/components/ui/`, adding 52 components from the registry alongside the existing nine, plus the `use-mobile` hook the sidebar depends on. Export `buttonVariants` from `button.tsx` for the primitives that compose it, and scope the ESLint exceptions the registry output needs to that directory.

Add the compositions shadcn documents without publishing to `client/components/`: `DataTable` with `DataTableColumnHeader`, `DataTablePagination` and `DataTableViewOptions` on TanStack Table, `DatePicker` and `DateRangePicker` on `Popover` and `Calendar`, and the `Typography*` prose primitives, with their strings in the application locales.

Add `client/pages/reference/`, worked source for building application UI: an `examples/` group of eight complete business screens on mock data — a dashboard, orders, customers, a product form, an inbox, a survey, team settings and a schedule — and a `components/` group with one page per shadcn/ui primitive, both sharing the frame in `shared.tsx`. An example owns a folder holding its page beside the mock data that page reads, as `examples/orders/orders.tsx` beside `orders.data.ts`, so the screen and its records move together.

Nothing routes these pages. They exist to be read and copied, so a production build never reaches them and no user sees one; `tests/logic/client-routes.test.ts` fails if a reference page reaches the router. Their wording sits beside them in `client/pages/reference/locales/` rather than in `client/locales/`, which keeps 115 KB of strings nothing renders out of every build. `tests/logic/locale-coverage.test.ts` fails on a key only one language has, and `tests/components/reference-pages.test.tsx` renders all of them against the English wording so a page that throws or leaves a placeholder unsubstituted fails the suite.
