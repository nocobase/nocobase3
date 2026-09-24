---
name: nocobase-app-plugin-authorization
description: 'Design and implement NocoBase 3 business permissions: job responsibilities, pages, business actions, fields, record scopes, relations, team inheritance, permission assignments, administration and inspection. Use when building a system or feature whose users have different access.'
metadata:
  short-description: Design and develop business authorization
  domain-owner: '@nocobase/app-plugin-authorization'
---

# Authorization development

Use the application's existing authorization service. Resolve `authorizationToken` from `@nocobase/app-plugin-authorization/server` in a provider or route factory. Read the application's `AGENTS.md` and inspect registered plugins and `server/config/authorization.ts` first. Application-owned features stay in the application's providers/routes/services; create a reusable plugin only when requested.

## Identify model and configuration changes

Inspect existing declarations, enforcement, permission sets and installed capability Skills. Classify each requested change by its content, whether the feature is new or already exists. A request can require both model development and configuration.

| Requested change                                                                                                                                      | Work required                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Add or change supported operations, field/relation capabilities, scope resolver logic, inheritance resolution or server enforcement                   | Develop the permission model and its execution path, then configure the affected business permissions |
| Change who holds an existing action, select an existing record-access strategy or its supported parameters, or adjust assignments and supported rules | Update permission configuration through the current management UI or authorized services              |
| Existing declarations have the right names but different behavior from the requirement                                                                | Correct the model; matching names alone do not establish that configuration is sufficient             |

For permission development, deliver both the implemented model and usable initial configuration based on the responsibility matrix: permission sets, pages/actions, selected scopes, applicable rules and intended user/team assignments. Do not stop at registration and leave configuration to the user unless they explicitly requested model-only work. If recipient identities or access decisions are missing, ask for those specifics while completing independent work; do not guess assignments. Keep configuration editable in the backend and preserve unrelated administrator choices.

Choose delivery by installation state: use seeds for fresh-install defaults and authorized runtime services or a controlled data-change workflow for an existing installation. These are ways to apply configuration, not alternatives to model development. Reuse current management pages and editors. Read the relevant references as needed, beginning with the business workflow for model changes and the service/configuration references for configuration changes.

## Start from business responsibilities

Before writing grants, turn the requirement into a matrix: actor/job, page, business action, allowed records, readable/writable fields, relation operations and exceptions. Identify who administers assignments separately from who uses the business feature. Ask only about missing decisions that affect access; record concrete assumptions and continue independent modeling work.

Use jobs as permission sets, such as sales engineer or delivery specialist. Ownership, region and assigned projects are record scopes, not extra role names. A person may hold a direct job plus an inherited team job. Define whether revoking one source should preserve the other. Describe each exception as a business fact: a delegated quote, a confidential project, or an active delivery team.

The sales example separates quote preparation from regional submission responsibility: an engineer can edit their own out-of-region draft but cannot submit it unless the parent project is also accessible. This is a useful model for multi-table operations; copy the responsibility boundary, not its fixture IDs, demo accounts or reset endpoint.

## Choose the implementation reference

| Task                                                                                         | Read                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build a feature from model through routes, assignments and verification                      | [Business module workflow](references/business-module.md)                                                                                                       |
| Declare typed actions, scopes, fields and nested relations                                   | [Fluent declarations](references/fluent-registration.md)                                                                                                        |
| Bind generated CRUD to business actions or choose a custom business endpoint                 | [Repository route integration](references/repository-routes.md)                                                                                                 |
| Teams/departments, default/sharing/restriction design, protected assignments and diagnostics | [Subjects and administration](references/subjects-and-administration.md)                                                                                        |
| Configure a baseline, collaboration exception or exclusion                                   | Installed sibling `nocobase-app-plugin-authz-default-access`, `nocobase-app-plugin-authz-sharing-rules`, or `nocobase-app-plugin-authz-restriction-rules` Skill |

Read [runtime setup and APIs](references/runtime-api.md) for registration and management endpoints, [client development](references/client-development.md) for routes/buttons/record eligibility, [code versus seeds](references/code-and-seeds.md) before writing installation data, and [Request scopes and permission-set services](references/core-api.md) for assignments, protection and transaction contracts.

This Skill and its bundled references are self-contained. The current sales collaboration and delivery example supplies the design used here; source paths identify optional comparison points, never prerequisites. In an installed App, implement the included patterns through public package exports without assuming the example source or source workspace exists.

Code defines the business permission model; seeds initialize editable business permission configuration. Administrators can subsequently change seeded sets, scopes, rules and assignments in the backend. App features register their own business resources and leave platform/system permission configuration to its owning plugins. See [code versus seeds](references/code-and-seeds.md) for the boundary and examples.

Read [optional capability discovery](references/optional-capabilities.md) before using any rule plugin. A missing corresponding Skill means the capability is unsupported in the current App and needs separate development; do not assume its APIs or tables exist.

## Implement in this order

1. Declare schema and relationships through self-contained migrations. Choose stable resource, page and scope names. Keep authorization decisions out of migration code.
2. Declare reusable data permissions with `defineDatabasePermission`; compose user-facing actions with `defineAuthorizationResource`. Explicitly name fields, relation capabilities and every table touched by a workflow.
3. Register collections, pages, flat resource groups, resources and record-access strategies in the owning provider. Resolve dependencies at boot and release subject registrations at shutdown.
4. Protect every server route with authentication. For a simple single-scope Repository operation, retain `defineRepositoryApiRoutes` and add `authz.db.authorizeRepository` to map methods to business actions; it reuses or initializes the request authorization scope. For workflows, persisted-state checks, multiple scopes or custom responses, use a custom handler with `authz.middleware()`, call the request scope's `authorize()` once and apply every returned table policy using `repository.withPolicy()`. Follow the selection criteria and complete code in [Repository route integration](references/repository-routes.md).
5. Add page authorization and `useCan` for action visibility. Obtain per-record eligibility from the server when needed. Handle pending/error states without displaying stale access.
6. Complete the accompanying permission configuration from the responsibility matrix: sets, page/action grants, selected scopes, supported rules and intended assignments. Use seeds for fresh installations and authorized provisioning for existing installations; do not assume editing a seed updates a running App. Resolve optional capabilities through their installed Skills and preserve unrelated administrator edits.
7. Verify denied as well as allowed requests through the production route factory and actual database policies. Then verify the UI with ordinary users and inherited memberships.

## Enforcement rules

- Register collections explicitly with `authz.db.collections.add({ name, title, actions? })`. Metadata comes from DB; registration grants nothing. Unregistered collections are denied even to unrestricted users.
- Business groups compose database capabilities; administration groups compose settings/system capabilities. Page grants are separate. Page visibility never authorizes a server endpoint.
- `can` is for feature visibility. `require`/`guard` require unconditional permission and reject conditional decisions. Composed business endpoints use `authorize`, reject denial/missing policies, and consume `conditions.database` without resolving aggregate grants again.
- For simple business CRUD, keep the original Repository route definition and use `db.authorizeRepository` to bind each method to its business action. Follow [Repository route integration](references/repository-routes.md). Multi-scope actions and workflow transitions require custom handlers. `db.policyFor` aggregates collection grants; it does not define a business-action boundary.
- Scope every read and write in the workflow, including parent lookups. Keep multi-record writes transactional and include expected business state in mutation predicates. Authorization does not validate a quote's amount or its workflow transition.
- Fields and relation operations are code-owned. The permission workspace configures business operations, their scopes and pages; do not build a second raw-field permission editor.
- Relation writes do not inherit the target collection's standalone constraints. Declare target record access and join-table fields explicitly; prevent foreign-key fields from bypassing association controls.
- Request scopes cache rules and grants. Reuse one within a request; create a new one for a new request/identity. Do not persist authorization decisions in module state.

## Completion evidence

Report the responsibility matrix implemented, model changes, configuration actually applied or prepared for installation, who can manage assignments, and observed allow/deny outcomes. Distinguish a written seed from one executed successfully; identify any unresolved recipient identities or access decisions. Cover no grant, page-only, action-only, out-of-scope rows, forbidden fields, invalid relation targets, multiple authorization sources and revocation. If optional plugins or required schema are absent, report that concrete limitation; never replace the missing boundary with an unconditional grant.
