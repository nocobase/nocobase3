# @nocobase/app-plugin-departments-example

Departments for the [authorization example](../app-plugin-authorization-example/README.md)'s trading company, wired into authorization as an inherited subject type. A permission set, sharing rule or restriction rule assigned to a department reaches its members and the members of every department below it; removing the member, unassigning it, or disabling the department or any ancestor each ends that inheritance on the next request. Each department may have a head, and every head holds a second, fixed subject type. Three department data scopes select records by their owner's department.

It follows the application development Skill's `organization.md` and is a runnable example rather than a reusable product plugin: its Settings → Departments page says so at the top. It depends on `@nocobase/app-plugin-authorization-example` and must be registered after it; the authorization example does not depend on this one.

## What it contributes

| Part                                                                                   | Where                                                 |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `departments` (with a `region` and a head) and `departmentMembers`                     | `database/migrations/`                                |
| Company tree, demo accounts, their assignments and regions                             | `database/seeds/`, built from `database/seed-data/`   |
| `OrganizationService`, its token and the region sync                                   | `server/services/organization.ts`, `server/tokens.ts` |
| `org.department` and `org.departmentHead` subject types and the `departments` settings | `server/authorization.ts`, `server/resources.ts`      |
| Department data scopes on projects, quotes and orders                                  | `server/scopes.ts`                                    |
| Departments API under `/api/departments-example`                                       | `server/routes/organization.ts`                       |
| Settings → Departments with a department child route                                   | `client/routes.ts`, `client/pages/settings/`          |

Every endpoint authenticates and checks the `departments` settings item: `read` for lists and details, `update` for writes. Membership writes, head changes and enabling or disabling a department notify each affected user after the transaction commits — members, and the previous and new heads — so their clients reload their permission snapshot. Errors answer a `code` the page translates.

It works with `@nocobase/app-plugin-authorization` alone. Default access, sharing rules and restriction rules are optional plugins: nothing at runtime requires them, they are only development dependencies here, and the seed skips every sharing-rule and restriction-rule row when the plugin's Collection is absent. `tests/permission-sets-only.test.ts` boots the example without them.

The settings menu entry, the settings item and its subsection in the permission workspace, and the subject type are all called 部门 / Departments. Seeded department titles are stored as encoded translation descriptors (`encodeAuthorizationTitle({ key, ns })`), the way the authorization example stores permission-set titles, and every surface — the department page, the subject picker, assignment lists and the inspector — renders them in the viewer's language; a department someone creates or renames stores plain text. The picker's search matches either language.

## Department heads

A department's head (负责人 / Head) is a user, set in the Basic info tab with a user picker, who need not be a member. The fixed subject type 部门负责人 / Department heads, whose only id is `*`, resolves for everyone who heads an active department whose whole ancestor chain is active, like `authenticated` does for every signed-in user. The seed assigns the 部门负责人 / Department head permission set to it once: whoever is appointed receives it, and whoever is replaced loses it on the next request.

## Department data scopes

Three record accesses select the authorization example's records by the department of their owner — `ownerId` on projects, `preparedById` on quotes. Orders have no owner and no relation to their project, so an order matches when its project's owner does. Only active memberships in departments whose whole ancestor chain is active count, on the owner's side and the viewer's.

| Key                         | Title                                       | Selects records owned by active members of                                            |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `org.myDepartments`         | 本部门 / My departments                     | The departments the viewer belongs to or heads                                        |
| `org.myDepartmentsAndBelow` | 本部门及下属部门 / My departments and below | Those departments and every active department below them                              |
| `org.selectedDepartment`    | 指定部门 / Selected department              | `params.departmentId`, and its descendants when `params.includeDescendants` is `true` |

The resolvers read nothing from the request but the principal, and treat stored params as untrusted: anything but a department id string and an optional boolean selects nothing. The permission workspace and the rule editors list all three, but they edit params only for the built-in custom filter; choosing 指定部门 there stores it without params, which selects nothing. Set its params in a seed or through the rule and permission-set APIs, as this seed does.

Owner-based scopes follow the person: when an owner moves to another department, their records move with them. Quotes follow their preparer, so a North engineer's draft for a South project is the North head's to see.

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

Departments carry the baseline; people carry their job role; the heads subject carries the head's role. The authorization example's sets and rules are reused, and this plugin adds two permission sets and one sharing rule of its own:

| Assigned to            | What                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Sales Center           | Permission set `example-sales-assistant`, inherited by both sales regions                                                  |
| Delivery               | Permission set `example-sales-delivery`                                                                                    |
| North Sales, Delivery  | Permission set 同部门项目查看 / Department project viewer: projects `view`, scope 本部门                                   |
| Department heads       | Permission set 部门负责人 / Department head: projects, quotes and orders `view`, scope 本部门及下属部门                    |
| Leo Wang, Eric Liu     | Permission set `example-sales-engineer`, directly                                                                          |
| Grace Zhou             | Permission set `example-sales-manager`, directly                                                                           |
| Sales Center, Delivery | Sharing rule `example-delivery-orders`: orders of the member's own region                                                  |
| Executive Office       | Sharing rule `example-selected-projects`                                                                                   |
| Delivery               | Sharing rule 销售项目共享给交付部 / Share sales projects with Delivery: projects `view`, 指定部门 = Sales Center and below |
| Example Trading Co.    | The three "exclude confidential projects" restriction rules, company-wide                                                  |

Delivery holds the project viewer set because sharing widens only an action a member already holds: its own scope reaches no project, since Delivery owns none, and the sharing rule adds Sales Center's. The confidentiality restrictions are this example's department-assigned restriction: assigned to the root department, they apply to everyone in the company, heads included. Default access is left as the authorization example seeds it: it is one baseline per resource for everyone, and a department scope there would empty the lists of the authorization example's own accounts outside the organisation.

The owner-based scopes need the records' owners in the organisation, so the seed also places the authorization example's salespeople: Alex Chen, Morgan Lee and Jamie Park in North Sales, Robin Lin in South Sales, each only when they have no membership yet. Their sales regions already match. They then inherit what those departments pass down, as any member does. The coordinator, whose project lies in another region, and the delivery specialist stay outside the organisation.

The accounts all use the password `departments-demo`. Every row is written only when it is missing, so an account or assignment an administrator changed is left alone on a replay.

| Account                      | Departments                          | Holds                                               | Sales region | Should see                                                                   |
| ---------------------------- | ------------------------------------ | --------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `grace@departments.example`  | Executive Office                     | Manager, directly                                   | —            | Projects: the shared Garden and Hill projects. Quotes and orders: none owned |
| `leo@departments.example`    | North Sales                          | Assistant from Sales Center; engineer, directly     | North        | North projects 1–2 (edit), every public quote, North orders 1–2              |
| `nina@departments.example`   | North Sales                          | Assistant from Sales Center                         | North        | All three pages open; projects and quotes empty; North orders 1–2, read-only |
| `chen@departments.example`   | South Sales (primary), also Delivery | Assistant from Sales Center; delivery from Delivery | South        | Projects and quotes empty; South order 3, which he may deliver               |
| `eric@departments.example`   | South Sales                          | Assistant from Sales Center; engineer, directly     | South        | South project 3 (edit), every public quote, South order 3                    |
| `mia@departments.example`    | Delivery                             | Delivery and project viewer from Delivery           | —            | Projects 1–3 through sharing; orders page empty: Delivery has no region      |
| `sophia@departments.example` | Sales Center, its head               | Assistant from Sales Center; head set as a head     | —            | Projects 1–3, their quotes and orders 1–3: all of North and South            |
| `owen@departments.example`   | North Sales, its head                | Assistant, project viewer; head set as a head       | North        | North projects 1–2, the quotes North people prepared, North orders 1–2       |

Nina and Leo also read each other's North projects through North Sales' project viewer set, and Chen reads projects 1–3 through Delivery's sharing rule. Confidential project 4 and its quote and order are hidden from everyone by the company-wide restriction. Exercises:

1. Give Delivery the region North in its Basic info tab: Mia's orders list shows North orders 1–2 on her next request, while Chen keeps South because his primary department decides.
2. Revoke Sales Center's assistant set in Authorization: Nina and Chen lose the quotes page, Nina keeps her projects through North Sales and Chen through Delivery, Chen keeps delivery from his other department, and Leo and Eric keep theirs through their direct role.
3. Move Nina to South Sales: her sales region becomes South and her orders list follows.
4. Make Owen the head of South Sales instead of North Sales: his lists switch to South on his next request, and Sophia's stay the same.
5. Move Alex Chen from North Sales to South Sales: project 1 leaves Owen's and Nina's lists and stays in Sophia's, because the scope follows its owner.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-departments-example check
```

The tests start a real application with the authentication, authorization, three rule plugins and the authorization example on a temporary SQLite database, so they cover the migrations and seeds that installation runs, the HTTP surface, the department scopes and heads, and each account's visibility in the authorization example's sales lists. One suite starts it without the rule plugins.
