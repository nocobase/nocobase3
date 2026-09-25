# @nocobase/app-plugin-departments-example

A department organisation wired into authorization as an inherited subject type. A permission set assigned to a department reaches its members and the members of every department below it; removing the member, unassigning the set, or disabling the department or any ancestor each ends that inheritance on the next request.

It follows the application development Skill's `organization.md` and is a runnable example rather than a reusable product plugin.

## What it contributes

| Part                                                                                                     | Where                                                 |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `departments` and `departmentMembers`                                                                    | `database/migrations/`                                |
| Demo tree, permission sets, assignments and accounts                                                     | `database/seeds/`, built from `database/seed-data/`   |
| `OrganizationService` and its token                                                                      | `server/services/organization.ts`, `server/tokens.ts` |
| `org.department` subject type, settings item, directory composite and `org.ownDepartments` record access | `server/authorization.ts`, `server/resources.ts`      |
| Organisation API under `/api/departments-example`                                                        | `server/routes/organization.ts`                       |
| Settings → Organization with a department child route, and the Department directory page                 | `client/routes.ts`, `client/pages/`                   |

Every organisation endpoint authenticates and checks the `organization` settings item: `read` for lists and details, `update` for writes. Membership writes notify each affected user after the transaction commits, so their clients reload their permission snapshot. The directory endpoint authorizes the `org.directory` composite's `view` action once and binds its `departments` policy to the query.

## Demo data

The seed creates Headquarters with Sales and Support below it and East sales below Sales, then three permission sets:

| Permission set                            | Grants                                                           | Assigned to   |
| ----------------------------------------- | ---------------------------------------------------------------- | ------------- |
| `departments-example-staff`               | The directory page, and `view` on the departments one belongs to | Headquarters  |
| `departments-example-organization-viewer` | `read` on the Organization settings                              | Sales         |
| `departments-example-whole-directory`     | The directory page, and `view` on every department               | Sam, directly |

It also writes four demo accounts straight into the authentication plugin's `user` and `account` tables, all with the password `departments-demo`. Every row is written only when it is missing, so an account or assignment an administrator changed is left alone on a replay.

| Account                    | Member of                   | Directory shows              | Organization settings | Why                                                                                                                            |
| -------------------------- | --------------------------- | ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `dana@departments.example` | Headquarters                | Headquarters                 | 403                   | The staff set on the root department reaches its own members; her departments are Headquarters alone.                          |
| `sam@departments.example`  | East sales                  | All four departments         | Read                  | Staff comes from Headquarters two levels up and the viewer set from Sales one level up; the whole directory is his direct set. |
| `sue@departments.example`  | Support                     | Headquarters, Support        | 403                   | Support inherits only from Headquarters; the Sales grant does not reach it.                                                    |
| `li@departments.example`   | Sales (primary) and Support | Headquarters, Sales, Support | Read                  | Memberships add up: both departments and their ancestors are hers, and Sales adds the viewer set.                              |

Revoking the staff set from Headquarters closes the directory for Dana, Sue and Li, while Sam keeps it through his direct assignment. A user in no department who holds the directory set gets an empty list, not an error.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-departments-example check
```

The tests start a real application with the authentication, authorization and sharing-rules plugins on a temporary SQLite database, so they cover the migrations and seeds that installation runs as well as the HTTP surface.
