---
'@nocobase/app-plugin-authorization-example': patch
---

Remove the example's own team subject. The `example.sales.team` subject type, its team and membership tables, the team permission-set, sharing and restriction assignments, and the `sales_dispatch` account are gone; `sales_proposal` now holds the engineer set and the quote-7 handover directly, and `sales_coordinator` is a direct project manager. Order delivery relations now target carriers (`authorizationExampleCarriers`, the `carrier` relation and `authorizationExampleOrderCarriers`) instead of teams. The departments example, `@nocobase/app-plugin-departments-example`, now demonstrates permission sets inherited through an organisation. The migration and seed were edited in place, so an existing example database must be reset before upgrading.
