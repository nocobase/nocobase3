# Sales permissions example

This example uses fictional projects, quotes, orders, accounts and regions to demonstrate composed business operations, named operation scopes, default access, sharing and restrictions. It contains no customer configuration or customer data.

Run application migrations and seeds through the Examples application's normal lifecycle. The seed creates `sales_assistant`, `sales_engineer`, `sales_manager` and `sales_delivery`, with the example password `AuthzExample123!`, their editable permission sets, four projects, seven practice quotes, four accepted historical quotes, four orders and all three rule types. The same seed initializes proposal and delivery teams and their members.

Open `/authorization-example` for the guide and the independently authorized `/authorization-example/projects`, `/authorization-example/quotes`, and `/authorization-example/orders` menus for records, relative to the application mount. In authorization settings, choose a business resource group, open an operation and configure each of its named scopes. There is no separate permission-set-wide scope. Default access, sharing and restriction rules select a business resource, operation and scope; the scope registration determines the table used for fields and record selection.

The four permission sets represent jobs: Sales assistant, Sales engineer, Project manager, and Delivery specialist. Accounts and permission-set keys use job names; region and ownership are data scopes.

| Account           | Role source                                              | Verification                                            |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| sales_assistant   | Direct sales assistant                                   | Read-only access, defaults and selected project sharing |
| sales_engineer    | Direct sales engineer                                    | Independent quote preparer and project-region scopes    |
| sales_manager     | Direct project manager                                   | Maintain owned projects; read quotes and orders         |
| sales_delivery    | Direct delivery specialist                               | Order menu and delivery workflow                        |
| sales_proposal    | Sales engineer inherited from Proposal team              | Team role, selected quote handover and restrictions     |
| sales_dispatch    | Delivery specialist inherited from Delivery team         | Team sharing and order-only menus                       |
| sales_coordinator | Direct project manager plus Proposal team sales engineer | Role union and independent revocation                   |

The guide displays the current account's effective roles and whether each comes from a user or team assignment. Teams are selectable authorization subjects in permission-set assignments, sharing rules, restrictions and inspection. Memberships are resolved from the database on each authenticated request; the inspector uses the same resolver. Disabling a team or removing membership stops inheritance on the next request. A selected quote handover shares both quote-7 and its South-region parent project-3 for submission with Proposal team; removing the team's role still denies submission. The existing direct-user sharing remains independent.

Registration is explicit in `server/sales-authorization.ts`. `authz.resources.add` declares action `scopes`; each scope names one underlying resource and offers configurable record-access policies. An underlying `authz.db.grant` references that scope by name. Grant helpers only return declarations; assigning a permission set activates them.

`submit` on quotes demonstrates two independent scopes: the default project scope is the user’s region, and the quote scope is the quote’s own preparer. A sales engineer account can submit quote-2, cannot submit colleague-prepared quote-5 on the same project, and cannot submit self-prepared quote-6 on an out-of-region project. Confidential quote-4 remains excluded by restrictions. `quotes` controls quotation reads and status updates; `projects` controls the parent-project lookup. Sharing a quote does not share its project. The submission endpoint calls `authorizationScope.authorize` once for `example.sales.quotes/submit`. Its `conditions.database` contains executable policies for both tables, and `conditions.checks` contains their decisions. These policies exclude grants from other business operations; the endpoint does not call `db.policyFor` again. Ordinary repository interfaces without an operation selector aggregate all granted underlying capabilities.

Selected operation scope, default access and sharing provide positive record access. Restrictions intersect the result. Sharing never grants an operation or its fields. Business rules affect only their matching grant branch; underlying collection restrictions still constrain every branch. If a record must be excluded across all operations and direct table grants, configure that restriction on the underlying collection.

Rules use `scopeKey` to select the declared scope and `scope` for its condition. For example, `{ action: 'submit', scopeKey: 'projects', selection: { type: 'records', ids: ['project-2'] } }` shares only the project scope. Record IDs are stored in each rule's actions JSON, separately for each action and named scope.

The seed is `database/seeds/202609220002_sales_permissions.ts`. Migrations create schema only. Submission requires a positive quote amount, draft status and an accessible parent project. Submitted quotes cannot be repriced. Delivery requires a nonempty reference and a ready order. Updates include state predicates to reject stale or repeated transitions.

Tests exercise production HTTP routes, SQLite persistence, permission editing, business endpoints, independent multi-table record sharing, field boundaries and migration rollback. Repository policies carry one scope and field list per operation: when grants expose different fields on different rows, the policy conservatively intersects the scopes required by those fields.

Permission sets and the inspector show page access separately from business operations. Default access, sharing, and restrictions only show business data scopes; raw table permissions remain internal. Each resource displays its own actions; inspector action details include permission-set sources and the underlying database checks with default, sharing and restriction reasons.

Register scope strategies once with `authz.db.recordAccess.add`. Optional `collections` and `requiredFields` declare applicability; every operation and rule selector derives its choices from that registry. An action scope may narrow the choices with `options`, but does not register a separate strategy. Projects reuse built-in `recordsIOwn`; quotes and orders use a related-project ownership strategy. The public-project and regional strategies are available in both permission sets and rules, as is the custom-filter editor.

The seed stores permission-set and rule titles as `{ key, ns }` descriptors. User names are ordinary fictional names. Title descriptors are preserved until explicitly renamed; no runtime title registry is required.

Permission sets grant page access explicitly and independently from business operations. A business view action grants database reads and does not open a page; entering a page does not grant its data operations. The delivery account can enter Orders but not Projects or Quotes. Lists show related record references; project summaries are fetched using the project view policy and never bypass it. Links preserve project/record filters, and the destination loads only its own permitted records. Quote rows show the preparer and submission eligibility, while the submission endpoint remains authoritative.

## Repeatable exercises

Start with `sales_assistant` for read-only defaults and selected project sharing, then `sales_engineer` for quote-2 (allowed), quote-5 (another preparer) and quote-6 (another region). Use `sales_proposal` for the separate quote-7 handover: neither its preparer nor its project matches the team's default scope. Removing either shared scope prevents submission. Team membership or role removal also prevents submission, while `sales_coordinator` retains its directly assigned project-manager role. Use `sales_delivery` and `sales_dispatch` to compare direct and inherited delivery permissions.

Existing orders reference accepted `quote-history-*` records, separate from draft practice quotes. Submitting a practice quote does not create an order. After a transition, an unrestricted administrator can use **Reset practice records** in the guide. The confirmation explains that this restores the fixed seeded business records for all demo accounts; it preserves accounts, permission sets, rules and team memberships, and leaves additional records alone. Restore any authorization changes manually before repeating the baseline scenarios. The seed and reset share one record builder so they cannot drift.

Lists report each record's permitted operations using both read and write scopes and required write fields. The server remains authoritative: invalid values return 400, denied access returns 403, and a stale business state returns 409. The guide groups exercises by their account, expected result and authorization reason. Use demo accounts rather than an unrestricted administrator when verifying boundaries.

## Authorization declarations and seed data

`server/sales-resources.ts` defines portable fluent page, collection, and business-resource builders. Startup registers their declarations through `server/sales-authorization.ts`; seed configuration uses the same builders' typed references without creating an application or registering resources again. `.build()` returns JSON-compatible declaration data, while record-scope resolver functions remain runtime code.

`database/seed-data/` has one data module per table: users, credential accounts, regional memberships, teams, team memberships, permission sets, default-access rules, sharing rules, restriction rules, their assignments, projects, quotes, and orders. Permission and rule data use their owning plugins' fluent builders. The seed entry coordinates insert order in one transaction. Business record builders are also used by the practice reset, so reset data and initial data stay aligned.

This example disables only TypeScript's `isolatedDeclarations` restriction so exported fluent declarations retain their inferred action and scope types across files. Full type checking and declaration generation remain enabled; duplicating those inferred types in handwritten interfaces would create a second permission catalogue to maintain.
