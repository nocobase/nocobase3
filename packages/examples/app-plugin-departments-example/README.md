# @nocobase/app-plugin-departments-example

Departments for the [authorization example](../app-plugin-authorization-example/README.md)'s trading company, wired into authorization as an inherited subject type. A permission set, sharing rule or restriction rule assigned to a department reaches its members and the members of every department below it; removing the member, unassigning it, or disabling the department or any ancestor each ends that inheritance on the next request.

It follows the application development Skill's `organization.md` and is a runnable example rather than a reusable product plugin: its Settings → Departments page says so at the top. It depends on `@nocobase/app-plugin-authorization-example` and must be registered after it; the authorization example does not depend on this one.

## What it contributes

| Part                                                         | Where                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `departments` (with a `region`) and `departmentMembers`      | `database/migrations/`                                |
| Company tree, demo accounts, their assignments and regions   | `database/seeds/`, built from `database/seed-data/`   |
| `OrganizationService`, its token and the region sync         | `server/services/organization.ts`, `server/tokens.ts` |
| `org.department` subject type and the `departments` settings | `server/authorization.ts`, `server/resources.ts`      |
| Departments API under `/api/departments-example`             | `server/routes/organization.ts`                       |
| Settings → Departments with a department child route         | `client/routes.ts`, `client/pages/settings/`          |

Every endpoint authenticates and checks the `departments` settings item: `read` for lists and details, `update` for writes. Membership writes notify each affected user after the transaction commits, so their clients reload their permission snapshot. Errors answer a `code` the page translates.

The settings menu entry, the settings item and its subsection in the permission workspace, and the subject type are all called 部门 / Departments. Seeded department titles are stored as encoded translation descriptors (`encodeAuthorizationTitle({ key, ns })`), the way the authorization example stores permission-set titles, and every surface — the department page, the subject picker, assignment lists and the inspector — renders them in the viewer's language; a department someone creates or renames stores plain text. The picker's search matches either language.

## Organisation attributes feed business data scopes

The authorization example's "own region" record access reads `authorizationExampleSalesMembers(id, region)`. Here the organisation is the source of truth for that region, as an HR sync would be: a department may carry a `region`, and every membership change, primary change, enable or disable, and region change re-derives the region of the users it touches in the same transaction — the primary department's region first, else another active regional department's — and writes, updates or deletes their sales-member row. The authorization example itself is unchanged; its data scopes simply follow the organisation.

## Demo data

```text
示例贸易公司 / Example Trading Co.
├─ 总经办 / Executive Office
├─ 销售中心 / Sales Center
│  ├─ 北区销售部 / North Sales      region North
│  └─ 南区销售部 / South Sales      region South
└─ 交付中心 / Delivery Center
   └─ 交付部 / Delivery
```

Departments carry the baseline; people carry their job role. Everything assigned is the authorization example's own:

| Assigned to            | What                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| Sales Center           | Permission set `example-sales-assistant`, inherited by both sales regions |
| Delivery               | Permission set `example-sales-delivery`                                   |
| Leo Wang, Eric Liu     | Permission set `example-sales-engineer`, directly                         |
| Grace Zhou             | Permission set `example-sales-manager`, directly                          |
| Sales Center, Delivery | Sharing rule `example-delivery-orders`: orders of the member's own region |
| Executive Office       | Sharing rule `example-selected-projects`                                  |
| Example Trading Co.    | The three "exclude confidential projects" restriction rules, company-wide |

The accounts all use the password `departments-demo`. Every row is written only when it is missing, so an account or assignment an administrator changed is left alone on a replay.

| Account                     | Departments                          | Holds                                               | Sales region | Should see                                                                   |
| --------------------------- | ------------------------------------ | --------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `grace@departments.example` | Executive Office                     | Manager, directly                                   | —            | Projects: the shared Garden and Hill projects. Quotes and orders: none owned |
| `leo@departments.example`   | North Sales                          | Assistant from Sales Center; engineer, directly     | North        | North projects 1–2 (edit), every public quote, North orders 1–2              |
| `nina@departments.example`  | North Sales                          | Assistant from Sales Center                         | North        | All three pages open; projects and quotes empty; North orders 1–2, read-only |
| `chen@departments.example`  | South Sales (primary), also Delivery | Assistant from Sales Center; delivery from Delivery | South        | Projects and quotes empty; South order 3, which he may deliver               |
| `eric@departments.example`  | South Sales                          | Assistant from Sales Center; engineer, directly     | South        | South project 3 (edit), every public quote, South order 3                    |
| `mia@departments.example`   | Delivery                             | Delivery from Delivery                              | —            | Only the orders page, empty: Delivery has no region                          |

Confidential project 4 and its quote and order are hidden from everyone by the company-wide restriction. Exercises:

1. Give Delivery the region North in its Basic info tab: Mia's orders list shows North orders 1–2 on her next request, while Chen keeps South because his primary department decides.
2. Revoke Sales Center's assistant set in Authorization: Nina and Chen lose the projects and quotes pages, Chen keeps delivery from his other department, and Leo and Eric keep theirs through their direct role.
3. Move Nina to South Sales: her sales region becomes South and her orders list follows.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-departments-example check
```

The tests start a real application with the authentication, authorization, three rule plugins and the authorization example on a temporary SQLite database, so they cover the migrations and seeds that installation runs, the HTTP surface, and each account's visibility in the authorization example's sales lists.
