---
name: nocobase-app-plugin-authorization-example
description: Explore the fictional sales permission example in a NocoBase v3 application.
---

Use the registered authorization example plugin and normal application migrations and seeds. Open `/authorization-example` for example accounts and `/authorization-example/projects`, `/authorization-example/quotes`, and `/authorization-example/orders` for independently authorized business menus. All paths are relative to the application mount.

Configure `example-sales-*` permission sets through authorization settings. Business groups contain flat resource actions. Each action declares named scopes bound to specific tables. Configure default access, sharing and restrictions by business resource, action and scopeKey. Use one `authorize` result and its `conditions.database` policies in business endpoints; generic interfaces aggregate underlying grants. Sharing records does not grant an operation or automatically share related quotes. Never copy real customer data into this example.

Scope policies are registered globally through `authz.db.recordAccess.add`, with `collections` and `requiredFields` determining applicability. Permission sets and all three rule editors share those choices. Projects reuse `recordsIOwn`; quote submission uses its independent `preparedById` through `example.sales.prepared`, while orders use parent-project ownership. Submission checks the project region independently. Business configuration hides underlying page/table categories and groups resources by sales collaboration and delivery. The inspector lists each resource’s own operations and explains both feature grants and underlying checks.

Keep four job-based permission sets: sales assistant, sales engineer, project manager and delivery specialist. Team subjects use `example.sales.team`; membership and active-state data live in the example team tables. Register membership resolution with `subjects.define(...).resolveFor` so authenticated requests and inspection agree. Seed both user and team assignments, never replace all direct assignments with team roles. Use sales_proposal and sales_dispatch to verify team-only access and sales_coordinator to verify direct-plus-inherited role union.

Use `sales_assistant`, `sales_engineer`, `sales_manager` and `sales_delivery` for direct roles. The independent team handover uses quote-7 and project-3; removing either shared scope must deny submission. Keep accepted order-source quotes separate from draft exercises. Only unrestricted administrators can reset the fixed business records through the guide's confirmation; resetting never changes authorization configuration or memberships. Restore rule changes manually before rerunning baseline exercises.
