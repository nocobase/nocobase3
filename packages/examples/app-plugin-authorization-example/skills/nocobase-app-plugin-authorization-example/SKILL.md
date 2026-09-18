---
name: nocobase-app-plugin-authorization-example
description: Explore and adapt the NocoBase 3 sales collaboration and delivery authorization example, including business scopes, team inheritance and relation permissions.
---

# Sales authorization example

Use this Skill to run or understand the installed example. For developing the user's real system, read the installed `nocobase-app-plugin-authorization` Skill first; reuse its workflow and this example's responsibility boundaries, not demo accounts, fixed IDs or practice-reset endpoints.

## Run and explore

Confirm the example, authentication and authorization are registered. The complete example additionally requires the installed `nocobase-app-plugin-authz-default-access`, `nocobase-app-plugin-authz-sharing-rules` and `nocobase-app-plugin-authz-restriction-rules` Skills; follow each for registration, configuration, migrations and seeds. If one is absent, the current App does not support that capability and it requires separate development; do not claim the related exercises can run. A customer App need not reproduce the example’s full plugin composition. Apply the application's normal migrations and seeds. Open `/authorization-example` for the business guide and `/authorization-example/projects`, `/authorization-example/quotes`, `/authorization-example/orders` for independently authorized pages. Paths are relative to the application mount.

Use the guide's ordinary accounts. Assistants consult public/shared materials; engineers edit their own prepared quotes and submit only when project responsibility also allows it; managers maintain owned projects; delivery specialists arrange eligible orders. Quotes and orders are independent exercises: submitting a draft does not generate an order.

The Proposal team receives explicit edit/submit sharing for quote-7 and submit access to parent project-3. Removing either submit scope prevents submission; removing the team's operation grant also prevents it. The coordinator retains directly owned project-8 after losing the team engineer source. Direct confidentiality restrictions persist independently of the team.

For delivery, connect an active team, maintain checks and collaborator notes. Verify inactive teams, protected foreign keys and internal join attributes are rejected. The operation permits association changes, not arbitrary editing of team records. Completed orders remain readable but cannot be rearranged.

## Optional source comparison

| Need                                                             | Example source                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| Typed actions, fields, multi-table scopes and nested relations   | `server/sales-resources.ts`                               |
| Reusable strategies and related-record queries                   | `server/sales-record-access.ts`, `server/sales-scopes.ts` |
| Provider registrations                                           | `server/sales-authorization.ts`, `server/providers/`      |
| Team membership, active filtering and subject selection          | `server/sales-teams.ts`                                   |
| One authorization decision and policy-bound execution            | `server/routes/index.ts`                                  |
| Permission sets, defaults, sharing, restrictions and assignments | `database/seed-data/`                                     |
| Independent page checks                                          | `client/routes.ts`                                        |
| Production request and policy verification                       | `tests/`                                                  |

Use public package exports in a consuming application rather than importing these private source files. Portable resource declarations are reused by seeds; providers register them. The same request scope supplies the composed operation's `conditions.database` policies. Each scope uses its own collection, and page access is granted separately. Relation targets and through fields are explicitly declared.

## Team directory boundary

The team subject picker relies on the calling page's existing management permission; no separate directory capability is required. Verify that listing and name resolution reject callers without that entry permission and allow authorized managers. Order team selection remains governed by the order's relation capabilities.

Use database filtering, literal case-insensitive search, stable title/ID ordering and pagination. Resolve only requested IDs. Pass the caller's `DatabaseConnection` into active-team checks during protected assignment transactions.

## Repeat and verify

Start with the guide's five business exercises; use independent scope removal as an advanced diagnostic. Check direct and inherited sources with `sales_proposal`, `sales_dispatch` and `sales_coordinator`. Verify API denials as well as UI visibility and use the inspector to understand contributing sources.

Only unrestricted administrators may reset fixed practice records through the confirmed guide action. Reset preserves permission sets, rules, membership and additional user-created orders. Restore authorization changes manually before repeating baseline exercises. The seed skips its whole bootstrap when sales memberships already exist; it does not repair individual missing rules or grants. Do not expect reseeding to restore removed grants.

When adapting the example, replace fictional jobs and relationships with the user's own responsibility matrix, omit the reset feature, and add acceptance cases for actual sensitive fields, state transitions and revocation paths. The endpoints and exercises below are included for installed Apps. The main authorization Skill includes implementation code for client integration, scope declarations, teams and seeds; it does not require this package’s private source files.

## Business HTTP API

All routes below are under `/api/authorization-example`, relative to the application mount, and require authentication. Resource IDs use the `example.sales.*` names from the declarations.

| Method and path                                         | Operation                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /context`                                          | Current roles and their direct/team sources                    |
| `GET /sales/projects`, `/sales/quotes`, `/sales/orders` | Policy-filtered lists and operation eligibility                |
| `POST /sales/projects/:id`                              | Edit allowed project details                                   |
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
