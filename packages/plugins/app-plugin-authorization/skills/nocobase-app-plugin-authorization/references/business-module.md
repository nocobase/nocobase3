# Build a business module with authorization

Use a quote submission workflow as the reference: engineers prepare quotes; project responsibility determines whether they can submit them; proposal teams can receive explicit handovers. Orders have separate delivery responsibilities; submitting a quote does not create an order. The same design applies to approvals, service tickets and project work. Source examples live in `@nocobase/app-plugin-authorization-example` in the source workspace; an installed App implements these patterns in its own feature files.

## 1. Write the responsibility matrix

| Job                 | Entry            | Action                   | Record boundary                                  | Data capability                                  |
| ------------------- | ---------------- | ------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| Sales assistant     | Projects, Quotes | View                     | Public/assigned materials                        | Read business fields                             |
| Sales engineer      | Quotes           | Edit draft               | Prepared by current user or explicitly delegated | Write amount and notes                           |
| Sales engineer      | Quotes           | Submit                   | Both accessible quote and responsible project    | Read parent; update quote status                 |
| Project manager     | Projects         | Maintain                 | Owned projects                                   | Write project details                            |
| Delivery specialist | Orders           | Arrange/confirm delivery | Owned/assigned orders                            | Relation operations or delivery status/reference |

Resolve unclear cases before granting access: may users consult colleagues' quotes, may a delegate submit as well as edit, and does confidentiality apply to every access path? Prefer meaningful action names to exposing all CRUD operations of every table.

## 2. Model and declare

Model ownership/preparer IDs, project relations, region membership and team membership as business data. Make membership changes an authorized business API. Keep credentials and fixture accounts out of production feature seeds.

Create `server/sales-resources.ts` using the complete `quotes` declaration in [runtime integration](runtime-api.md#declare-a-business-operation). `defineDatabasePermission` declares fields and relation capabilities; `defineAuthorizationResource` binds them to action scope keys. A `submit` action binds `quotes` to quote read/status update and `projects` to parent read. Give independently controlled tables separate keys even when a workflow edits only one of them.

Keep portable declarations free of database queries so provisioning can reuse `resource.reference().grant(...)`. Return fluent builders from callbacks. Define translations in the owning package and use `{ key, ns }` for persisted labels. Do not duplicate resource/action strings in role factories when a typed reference is available.

## 3. Register and resolve scopes

Resolve `authorizationToken` and the database in the owning provider. Register collections, independent pages, the `sales` group with category `business` and resource declarations there. Register custom record access with `authz.recordAccess.add`.

The following application-owned `server/sales-record-access.ts` implements the two strategies needed by the engineer set. Its migrations must define `quotes.preparedById`, `projects.region` and a trusted `salesMembers` table with user ID and region; membership is maintained by authorized business code. A direct preparer rule returns `buildFilter(f => f.string('preparedById').eq(principal.id))`. A regional rule derives the user's region from trusted membership data and filters projects by that region. Handle no memberships as no records; never turn an empty result into `allRecords`. Declare `.resources({ type: 'database.collection', id })` accurately and validate optional parameters through `.params(schema)`.

```ts
import { defineRecordAccess } from '@nocobase/authorization/core';
import type { AppAuthorizationService } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';

export function registerSalesScopes(
  authz: AppAuthorizationService,
  database: DatabaseManager,
) {
  authz.recordAccess.add(
    defineRecordAccess('sales.prepared', (access) =>
      access
        .title('Prepared by me')
        .resources({ type: 'database.collection', id: 'quotes' })
        .resolve(({ principal }) =>
          principal.type === 'user'
            ? buildFilter((f) => f.string('preparedById').eq(principal.id))
            : false,
        ),
    ),
  );
  authz.recordAccess.add(
    defineRecordAccess('sales.region', (access) =>
      access
        .title('My sales region')
        .resources({ type: 'database.collection', id: 'projects' })
        .resolve(async ({ principal }) => {
          if (principal.type !== 'user') return false;
          const member = await database
            .connection()
            .query.selectFrom('salesMembers')
            .select('region')
            .where('id', '=', principal.id)
            .executeTakeFirst();
          return member
            ? buildFilter((f) => f.string('region').eq(String(member.region)))
            : false;
        }),
    ),
  );
}
```

Call `registerSalesScopes` from the same provider boot that registers the resources. For public/owned quote or order scopes, first select project IDs using the trusted confidentiality/ownership predicate, then return a filter on the child table's `projectId`; return `false` when no projects match. The following helper supplies the public quote scope used by the optional rule examples:

```ts
export function registerPublicQuoteScope(
  authz: AppAuthorizationService,
  database: DatabaseManager,
) {
  authz.recordAccess.add(
    defineRecordAccess('sales.public', (access) =>
      access
        .title('Public projects')
        .resources({ type: 'database.collection', id: 'quotes' })
        .resolve(async () => {
          const projects = await database
            .connection()
            .query.selectFrom('projects')
            .select('id')
            .where('confidential', '=', false)
            .execute();
          return projects.length
            ? buildFilter((f) =>
                f.or(
                  projects.map((p) => f.string('projectId').eq(String(p.id))),
                ),
              )
            : false;
        }),
    ),
  );
}
```

This is a scope resolver's trusted lookup, not a public list endpoint. The model needs `projects.confidential`. The example applies a public scope to several collections; add each applicability and its correct parent mapping deliberately instead of treating every table's ID as a project ID. For large datasets, implement an appropriate database-backed parent lookup strategy and measure it; the small demonstration's ID list is not a universal scaling design.

Reuse `recordsIOwn`/`recordsICreated` when the table has the corresponding column (default `ownerId`/`createdById`, configurable with `params.field`). Use custom strategies when ownership follows a parent. Do not assume an ID from a team subject is a user ID; user-dependent strategies must receive the right principal context.

## 4. Enforce at the endpoint

Use an App-owned `defineApiRoutes` factory that creates a Hono router, resolves services, and installs authentication, authorization and input limits. Business code accepts the resolved policy rather than unrestricted repositories.

The following service function accepts the current request scope. Its caller authenticates first, installs `authz.middleware()`, and calls `await submitQuote(database, c.var.authz, c.req.param('id'))`. Keep it in an App-owned module, then return the route's success response only after it resolves.

```ts
import type { AuthorizationScope } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';
import { HTTPException } from 'hono/http-exception';

export async function submitQuote(
  database: DatabaseManager,
  scope: AuthorizationScope,
  quoteId: string,
): Promise<void> {
  const decision = await scope.authorize({
    resource: { type: 'resource', id: 'sales.quotes' },
    action: 'submit',
  });
  const policies = decision.conditions?.database;
  if (decision.effect === 'deny' || !policies?.quotes || !policies.projects)
    throw new HTTPException(403, { message: 'Forbidden' });
  const quotePolicy = policies.quotes;
  const projectPolicy = policies.projects;

  await database.transaction(async (connection) => {
    const quotes = connection.repository('quotes').withPolicy(quotePolicy);
    const quote = await quotes.findOne({ filter: { id: quoteId } });
    if (!quote || typeof quote.projectId !== 'string')
      throw new HTTPException(404, { message: 'Quote not found' });

    const project = await connection
      .repository('projects')
      .withPolicy(projectPolicy)
      .findOne({ filter: { id: quote.projectId } });
    if (!project) throw new HTTPException(403, { message: 'Forbidden' });
    if (quote.status !== 'draft')
      throw new HTTPException(409, { message: 'Quote is no longer a draft' });
    if (typeof quote.amount !== 'number' || quote.amount <= 0)
      throw new HTTPException(400, {
        message: 'A positive amount is required',
      });

    await quotes.updateOne({
      // Preserve the parent and business state actually checked above.
      filter: {
        id: quoteId,
        projectId: quote.projectId,
        status: 'draft',
        amount: quote.amount,
      },
      values: { status: 'submitted' },
    });
  });
}
```

The owning route maps repository denials to 403 and `RECORD_NOT_FOUND` to a non-disclosing 404 or state-conflict response. It preserves the explicit 400/403/404/409 outcomes above and does not expose database errors. A concurrent change that invalidates the update predicate must fail; never retry it as an unconditional write. If a workflow requires a parent state to remain unchanged until commit, add appropriate locking or version checks for that parent too; a transaction alone does not supply that guarantee.

Do not fetch unrestricted data and filter it in JavaScript. Do not query only the parent ID supplied by the client. Do not call `require` or an aggregate `db.policyFor` after this decision; the composed result already includes all underlying checks and policies. Resolve authorization once per request and bind its results to the repositories on the transaction connection.

For collection CRUD without an operation boundary, use `db.policyFor` and bind the result. For simple business Repository API routes, use [business-action middleware](repository-routes.md) while retaining static route policies. Mount it on all exposed actions. An endpoint policy is a maximum, not a source of grants.

## 5. Configure roles and scope rules

Complete this configuration as part of delivering the permission feature, for both new modules and changes to existing ones. Determine which declarations need development and which existing configurations need adjustment from the responsibility matrix. Use installation seeds for a fresh App or authorized provisioning for an existing App; keep administrator-owned configuration editable and preserve unrelated choices.

Create the engineer set with page access and quote actions separately. Configure edit with a preparer scope; submit with preparer and region scopes. Do not use project ownership as an edit default if that would reopen a colleague's quote.

The following rule-based extensions require the corresponding installed Skills; follow [capability discovery](optional-capabilities.md) first. Without them, describe the missing capability as separate development rather than assuming the example configuration is available. Add default access only for an intentional baseline. Add sharing for the delegation exception: the delegated quote's edit and submit scopes plus its actual parent project's submit scope, assigned to the Proposal team. Sharing the quote does not automatically grant its parent or the submit action. Add restrictions for confidential records at the appropriate boundary; a collection restriction covers all operation branches when the invariant must apply everywhere.

Use the three optional rule Skills for implementation. Follow [code declarations and seeds](code-and-seeds.md) for an executable permission-set declaration, persistence row shapes and initialization rules. Migrations contain schema operations only. Keep demonstration account creation and practice reset out of production features.

## 6. Relations and transitions

An order's team, checks and collaborators have different capabilities. The delivery role may connect an active team, create/update/delete checks, and set collaborators with a public `note`; that does not permit editing team records or an internal join-table note. Declare each through the fluent relation API and keep protected foreign keys out of root writable fields.

Read expansion and relation mutation need separate allowlists. Test nested create/update/upsert/delete and connect/disconnect/set only where the feature offers them. Upsert requires both create and update grants. A denied nested operation must roll back the entire mutation. The complete relation declaration pattern is in [fluent declarations](fluent-registration.md).

Business state remains an independent rule: completed orders can be read while delivery arrangement is closed. Checking an authorization capability does not override that state restriction.

## 7. Client and verification

Declare page `authz` with a stable `page` ID and `access`. Follow [client development](client-development.md), including a complete action component. Use `useCan({ resource, action })` for action visibility and the server's per-record eligibility for row controls. Show useful loading/error/retry behavior. Invalidate affected lists and relationship controls after mutation while preserving the current selection when appropriate.

Verify using the real route factory and database: an engineer can edit an out-of-region draft but cannot submit it; a colleague's quote remains unwritable; a delegated quote still needs parent access; confidential rows remain excluded despite sharing; removing a team source leaves unrelated direct responsibilities intact. Verify page-only permission cannot read data and action-only permission cannot open the page. Use ordinary accounts, not root, and inspect decisions for both success and denial.
