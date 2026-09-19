# @nocobase/app-plugin-authorization-example

Runnable examples of sales collaboration and order delivery permissions. They demonstrate realistic independent responsibilities, not a complete quote-to-order workflow. For production API contracts, use the [authorization README](../../plugins/app-plugin-authorization/README.md) and [development Skill](../../plugins/app-plugin-authorization/skills/nocobase-app-plugin-authorization/SKILL.md).

## Run the examples

Register this package's default client/server plugins with authentication, authorization and the three optional scope-rule plugins, then run the application's normal migrations and seeds. The Examples application includes this composition. Open `/authorization-example` for the guide and `/authorization-example/projects`, `/authorization-example/quotes`, `/authorization-example/orders` for the independently authorized pages; paths are relative to the application mount.

Use the seeded demo accounts shown in the guide. Keep demo credentials and practice reset out of a production feature. Seeds initialize missing data without overwriting existing permissions. An unrestricted administrator can reset the fixed business practice records; this preserves permissions, team memberships and additional user-created orders. Restore authorization changes separately before repeating baseline exercises.

## Responsibilities demonstrated

| Account             | Job source                        | Business example                                                  |
| ------------------- | --------------------------------- | ----------------------------------------------------------------- |
| `sales_assistant`   | Direct sales assistant            | Consult public and explicitly shared materials                    |
| `sales_engineer`    | Direct sales engineer             | Edit prepared quotes; submit only with responsible-project access |
| `sales_manager`     | Direct project manager            | Maintain owned projects and consult related work                  |
| `sales_delivery`    | Direct delivery specialist        | Arrange and confirm eligible order delivery                       |
| `sales_proposal`    | Proposal team engineer            | Take over an explicitly delegated quote                           |
| `sales_dispatch`    | Delivery team specialist          | Inherit delivery responsibilities                                 |
| `sales_coordinator` | Direct manager plus team engineer | Preserve personal responsibilities after team revocation          |

Engineers can edit their own out-of-region drafts without being allowed to submit them. The Proposal team can edit/submit quote-7 through explicit quote and project-3 sharing. Sharing alone does not grant Submit. The coordinator retains owned project-8 when the team source is removed; direct confidentiality restrictions remain in force. Orders reference accepted historical quotes, separate from the draft exercises; submitting a practice quote does not create an order.

## Source map

| Source                                                                                             | Reuse the pattern for                                                                   |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [sales-resources.ts](server/sales-resources.ts)                                                    | Typed business actions, independent multi-table scopes, fields, relations and pages     |
| [sales-record-access.ts](server/sales-record-access.ts), [sales-scopes.ts](server/sales-scopes.ts) | Preparer, ownership, region and public-record strategies                                |
| [sales-authorization.ts](server/sales-authorization.ts)                                            | Explicit registration from the provider                                                 |
| [sales-teams.ts](server/sales-teams.ts)                                                            | Active team membership resolution and authorized subject selectors                      |
| [routes](server/routes/index.ts)                                                                   | One composed decision, policy-bound repositories, business transitions and transactions |
| [seed declarations](database/seed-data)                                                            | Typed permission sets, scope rules, user/team assignments and idempotent provisioning   |
| [client routes](client/routes.ts)                                                                  | Page access independent from business operations                                        |
| [tests](tests)                                                                                     | Production routes and persisted allow/deny outcomes                                     |

Portable declarations perform no DB work. The provider registers them; seeds reuse typed references. Strategies close over the owning services. A composed Submit decision yields policies for quotes and projects; the route consumes both without resolving aggregate collection grants again. It separately validates positive amount, draft state and the actual parent relationship.

## Team directory administration

Team pickers use the calling permission-set, rule or inspector endpoint's existing management permission. The example adds no separate directory permission. Reading picker options does not grant the ability to change teams, membership or assignments; order relation selectors continue to use their business relation policies.

Search and pagination execute in the database, with case-insensitive literal substring matching and stable title/ID ordering. ID resolution and active-team checks query only the requested IDs. Active-team checks use a supplied transaction so protected assignment checks observe the caller's changes consistently.

## Business HTTP API

All routes below are under `/api/authorization-example`, relative to the application mount, and require authentication. Resource IDs use the `example.sales.*` names from the declarations.

| Method and path                                         | Operation                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /context`                                          | Current roles and their direct/team sources                    |
| `GET /sales/projects`, `/sales/quotes`, `/sales/orders` | Policy-filtered lists and operation eligibility                |
| `POST /salesProjects:updateOne`                         | Edit allowed project details                                   |
| `POST /sales/quotes/:id`                                | Edit draft amount/notes                                        |
| `POST /sales/quotes/:id/submit`                         | Submit an eligible quote after quote and project authorization |
| `GET /sales/orders/:id/relations`                       | Read allowed order relations                                   |
| `POST /sales/orders/:id/relations`                      | Manage delivery team, checks and collaborators                 |
| `POST /sales/orders/:id/deliver`                        | Confirm a ready order with a delivery reference                |
| `POST /reset`                                           | Unrestricted administrator restores fixed practice records     |

For relation request bodies, use Repository relation values:

```json
{ "deliveryTeam": { "connect": { "id": "delivery" } } }
```

```json
{
  "checks": {
    "update": [{ "filter": { "id": "check-1" }, "values": { "done": true } }]
  }
}
```

```json
{
  "collaborators": {
    "connect": [
      { "where": { "id": "proposal" }, "through": { "note": "Review" } }
    ]
  }
}
```

Only active team targets are allowed. Team data, direct ownership/association foreign keys and internal join attributes are not writable through this operation. Nested create/update/upsert/delete and connect/disconnect/set are declared explicitly; a failed nested operation must roll back. Completed orders remain readable but cannot be rearranged.

## Exercises and acceptance

1. As the assistant, read the public and selected shared records without acquiring edit rights.
2. As the engineer, edit/submit quote-2; read but do not edit colleague quote-5; edit but do not submit out-of-region quote-6. Confidential quote-4 stays excluded.
3. As the proposal user, edit/submit delegated quote-7. Remove team sharing and verify both stop; remove only the parent-project submit scope and verify submission stops.
4. As the coordinator, compare personal project-8 and team quote-7. Revoke the team's engineer set and verify the personal project responsibility survives.
5. As the direct and inherited delivery users, arrange eligible order relations and confirm delivery. Verify read-only users, inactive targets and protected fields are denied.

Reset business state before repeating transitions and restore changed rule/assignment configuration. Verify using ordinary accounts and direct API requests as well as UI. The tests cover page/action separation, field and row boundaries, multi-scope sharing, restrictions, membership revocation, relation rollback, seed/reset behavior and migration reversal. Use the inspector to explain sources; it does not replace execution tests.

## Route organization and Repository CRUD suitability

`server/routes/index.ts` is the only route contribution: it resolves dependencies, installs authentication, authorization and the request body limit, mounts the internal routers and maps errors. Internal router factories are composed under this protected boundary; they are not independent public contributions. `practice.ts` owns context/reset, `lists.ts` owns the three enriched business lists, `projects.ts` owns generated project queries/editing with business-action middleware, `quotes.ts` owns editing/submission, and `orders.ts` owns delivery relations/confirmation. `mutations.ts` shares input validation and writable-record lookup; `errors.ts` preserves the HTTP error mapping. Declare each endpoint explicitly, including all three lists; keep authorization, business validation, writes and responses visually separated. Shared query helpers should not hide route/action selection behind a loop.

| Existing endpoint            | Suitability for generated Repository CRUD                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Project edit                 | Uses generated `updateOne`, bound to project `edit`, with independent input validation                                                     |
| Project/quote/order lists    | Custom presentation: include page navigation and per-record operation reasons; quote/order lists also include authorized project summaries |
| Quote edit                   | Keep a business handler: draft-only validation and an expected-state update predicate                                                      |
| Quote submit                 | Keep a business handler: consume both quote and actual parent-project policies, validate amount/state and conditionally update             |
| Order relation read          | Custom presentation: returns current relations, permitted operations and scoped target options                                             |
| Order relation write/deliver | Keep business handlers: state validation, relation policy enforcement or delivery-reference validation                                     |
| Context/reset                | Demonstration-specific logic, not generic CRUD                                                                                             |

The project router exposes POST `salesProjects:findMany`, `salesProjects:findOne`, `salesProjects:count` and `salesProjects:updateOne` through `defineRepositoryApiRoutes`; `authz.db.authorizeRepository` binds query methods to `view` and updates to `edit`. The existing GET list retains enriched display data. Project edit sends `{ filter: { id }, values }` and receives the Repository response; hidden targets return 404. Do not replace the existing enriched lists with raw Repository responses or use collection-aggregated grants for business operations. Read the main authorization Skill’s bundled `references/repository-routes.md` for a complete integration example. Multi-scope authorization remains explicit in business handlers.
