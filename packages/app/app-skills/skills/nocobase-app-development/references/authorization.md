# Design application permissions

Use this reference when a feature distinguishes people, jobs, teams, pages, operations, fields or records. Model access while designing the feature; adding only hidden buttons after building unrestricted endpoints leaves the system incomplete.

## Discover the capability

Inspect `package.json`, `client/plugins.ts`, `server/plugins.ts` and `server/config/authorization.ts`. Read the installed `.agents/skills/nocobase-app-plugin-authorization/SKILL.md` before implementation. If installed Skills are stale, run `pnpm skills:sync`; do not edit generated copies. Check registration separately from dependency presence.

Default access, sharing rules and restriction rules are optional plugins. Read their installed Skills when the business requirement calls for a common baseline, collaboration exception or record exclusion. If the corresponding Skill is absent, treat the capability as unsupported in this App and explain that it requires separate development. Do not assume its APIs, tables or seed format, or silently install/configure it. If the Skill exists, follow it to verify runtime activation and migrations. Implementation and seed details belong to that owning Skill. Do not implement replacement role tables or assume all optional plugins are present.

## Turn requirements into a matrix

Record actor/job, page, business operation, data scope, readable/writable fields, relation capabilities and administrator responsibilities. Use real jobs as permission sets and business relationships as scopes. Clarify material missing boundaries, such as whether a delegate can submit as well as edit, and whether a confidentiality restriction must cover every operation.

Keep page access independent from business action grants. Distinguish operations that can touch the same table: editing a draft may update amount/notes while submission only changes state after checking the parent project. A user can hold both a personal job and a team job; revoking the team source should preserve unrelated personal responsibilities.

## Implement in application-owned files

For new and existing features alike, classify the requested changes by content. Supported operations, fields/relations, resolver behavior and enforcement belong to the model; selecting supported scopes/parameters, grants, rules and recipients belongs to configuration. A request can require both. When developing a permission model, also complete its usable initial or adjusted business configuration from the responsibility matrix; do not stop at declarations unless the user explicitly asks for model-only work. Clarify unknown recipients without guessing assignments.

Declare reusable data permissions and composed resources in a feature module. In `server/providers/`, resolve `authorizationToken`, register collections/pages/groups/resources and record-access strategies, and register inherited subjects when the feature owns a team/department model. Read the authorization Skill’s bundled `references/code-and-seeds.md` before choosing initialization: code declares capabilities, provider boot registers them, and seeds initialize the agreed business configuration for fresh installations. Use authorized services or controlled data changes for existing installations. Seeded permission sets, selected scopes, rules and assignments remain editable in the backend; seeds do not make them code-owned or protected. App features own business resource declarations and initial business configuration, not root/member protection or other platform permission configuration. Never rewrite administrator configuration at boot. Normal seeds have a restricted database context, not the running authorization service. Keep schema changes in migrations and initial assignments in idempotent seeds or controlled provisioning. Do not create a plugin package for an application-owned feature.

Every `server/routes/` endpoint installs authentication and authorization. A composed operation calls the request scope's `authorize` once and binds each returned `conditions.database` policy through `repository.withPolicy`. Do not replace it with aggregate authorization or an in-memory filter. Use ordinary `db.policyFor` for collection CRUD and `db.authorizeRepository` for simple business Repository routes, mapping each method to its business action. The authorization Skill documents these choices and their contracts.

Declare route page access in `client/routes.ts`; use `useCan({ resource, action })` for button visibility and server-computed eligibility for record-sensitive actions. Keep pending/failed checks closed and refresh after permission changes. Client visibility does not enforce the API. The authorization Skill’s `references/client-development.md` includes the component, relation controls and settings lifecycle; all required APIs are bundled in that Skill rather than external package documentation.

The permission workspace edits actions, scopes and page grants. Field and relation capabilities are code-owned. A new field or workflow must update its declaration and enforcement; it is not an administrator entering arbitrary database grants. Follow the dedicated Skill for custom scope resolvers, multi-table transactions, relation targets, protected assignments and last-administrator checks.

## Verify and explain

Test an ordinary user with no grant, page-only and action-only grants, rows owned by another user, forbidden fields, invalid relation targets, and stale workflow states. For multi-table operations, remove each required scope independently. Test direct API requests, rollback and independent revocation of direct/inherited sources. Use the inspector to understand decisions, not as a substitute for running the operation.

Explain to the user which business decisions were implemented, which settings they can maintain and which changes require development. Use the authorization Skill’s bundled quote/project/delivery workflow as the implementation reference, but do not copy demo credentials, fixed record IDs or reset endpoints into the App.
