# @nocobase/app-plugin-departments-example

A department organisation wired into authorization as an inherited subject type. A permission set assigned to a department reaches its members and the members of every department below it; removing the member, unassigning the set, or disabling the department or any ancestor each ends that inheritance on the next request.

It follows the application development Skill's `organization.md` and is a runnable example rather than a reusable product plugin.

## What it contributes

| Part                                                                                                     | Where                                                 |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `departments` and `departmentMembers`                                                                    | `database/migrations/`                                |
| Demo tree and the staff set assigned to Headquarters                                                     | `database/seeds/`, built from `database/seed-data/`   |
| `OrganizationService` and its token                                                                      | `server/services/organization.ts`, `server/tokens.ts` |
| `org.department` subject type, settings item, directory composite and `org.ownDepartments` record access | `server/authorization.ts`, `server/resources.ts`      |
| Organisation API under `/api/departments-example`                                                        | `server/routes/organization.ts`                       |
| Demo accounts, created once at start                                                                     | `server/demo.ts`                                      |
| Settings → Organization with a department child route, and the Department directory page                 | `client/routes.ts`, `client/pages/`                   |

Every organisation endpoint authenticates and checks the `organization` settings item: `read` for lists and details, `update` for writes. Membership writes notify each affected user after the transaction commits, so their clients reload their permission snapshot. The directory endpoint authorizes the `org.directory` composite's `view` action once and binds its `departments` policy to the query.

## Demo data

The seed creates Headquarters with Sales, East sales and Support below it, the `departments-example-staff` permission set (the directory page plus `view` on the departments the user belongs to) and its assignment to Headquarters. At start the plugin creates three demo accounts, each only if it does not exist yet, with the password `departments-demo`: `dana@departments.example` in Headquarters, `sam@departments.example` in East sales and `sue@departments.example` in Support.

## Verification

```bash
pnpm --filter @nocobase/app-plugin-departments-example check
```

The tests start a real application with the authentication, authorization and sharing-rules plugins on a temporary SQLite database, so they cover the migrations and seeds that installation runs as well as the HTTP surface.
