# Execute the three examples

These adjacent TypeScript examples are executable source, not pseudo APIs. Copy
only the example needed into the owning App or plugin and import public package
subpaths. The App must already run the Audit/authentication/authorization plugins
and their migrations, with prepared main storage. Set enabled and the relevant
source through Settings; business tables start unselected.

## HTTP declaration

Add auditExampleRoutes from examples/http.ts to the App's existing
server/routes/index.ts contribution array (or the reusable plugin's routes
array). It exposes GET /api/audit-example/status, relative to the deployment base.
Issue a request with the ordinary signed-in session: expect 200 and
{available:true}, then query audit/events?store=main&action=audit-example.status.
Expect a request event with outcome success and the authenticated user actor.
An anonymous request returns 401 and records denied with anonymous actor.
The response is fixed non-sensitive status; this is why no extra domain grant is
required. Add explicit resource/action authorization before returning real private
business data. Place audit.http before the route's authentication/authorization.
A parent rejection before a child declaration runs cannot claim that child action.
Startup rejects distinct audit.http declarations on potentially overlapping paths
with compatible methods (including ALL), permits reuse of the same declaration
object only when its captured fields are unchanged, and conservatively rejects
complex regex paths whose separation cannot be
proven; use disjoint literal prefixes or a single declaration for those paths.

## Runtime recorder

In trusted server composition resolve the original auditServiceToken and call
service.bind(trustedScope, {producer:'audit-example-runtime'}). Pass only that
AuditRecorder to recordValidation from examples/runtime.ts. trustedScope is
provided by the authenticated server adapter or verified job host: appId is the
host App; actor is the executing authenticated user/runtime; initiator preserves
the original verified human across child work. Do not construct it from request
JSON, headers claiming identity, model output, or unverified queue payloads.
AuditService.bind does not authenticate scope supplied by its caller.

After a real domain validation succeeds, await recordValidation(recorder).
A committed receipt has an eventId; query audit/events?store=main&kind=business
and find action audit-example.validation-completed with the exact trusted identity.
The example records an explicit domain fact, not a managed database summary.
Disabled/excluded receipts are not delivery; errors are not disabled receipts.
Pass an exact active transaction handle in record options only when deliberately
joining that connection's transaction; pending-commit is not committed.

## Table policy

Create audit_example_items through an App-owned migration (id string primary key,
name string), migrate it normally, and restart to refresh discovered targets.
With complete Audit settings management permission, call selectExampleTable from
examples/table-policy.ts using the App's authenticated API client. It GETs
audit/settings and PUTs its revision/CAS update, preserving other selections.
A 409 means reload and resolve the newer policy; never blindly retry stale data.
The physical table must appear in the audit/settings response metadata. Deployment
requirements and accessible stores constrain edits independently of this client.
Read `audit/settings` back in the same target App after the update and confirm
the saved enabled/source/table selection before testing a write. Existing saved
Settings take precedence over deployment defaults; editing defaults or leaving
the selection as a later administrator task does not enable a requested summary.

In trusted App business code execute:

    await database.connection('main').query.insertInto('audit_example_items')
      .values({ id: 'audit-example-1', name: 'Synthetic item' }).execute();

Use the existing databaseManagerToken from @nocobase/db to obtain database.
Run the write in the App's trusted request/runtime scope. Query
audit/events?store=main&kind=database: expect database.insert, target table
audit_example_items and countSemantics inserted (or the driver's proven value).
The summary contains no name value, WHERE bindings, old/new row or diff. A caught
summary failure still makes the protected transaction rollback-only. A write
before selection produces no database summary. Raw client SQL is outside coverage.
Verify this write and its summary in the App being delivered, using its actual
persisted policy and trusted operation scope. A separate test database proves
the example's behavior but does not establish that the target App is configured.
