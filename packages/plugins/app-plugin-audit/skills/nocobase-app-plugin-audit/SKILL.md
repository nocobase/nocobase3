---
name: nocobase-app-plugin-audit
description: Add operation auditing to NocoBase v3 App-owned business code or reusable plugins using declared HTTP routes, trusted runtime recording, and explicitly selected database tables. Use to verify audit events or customize their client presentation; not for Record History or data recovery.
---

# Add auditing to a business feature

## Public-contract development

This workflow uses the App-owned source, published Skills and documentation,
package exports, and declarations needed to understand those public APIs. Keep
framework and plugin implementation inspection outside this workflow: do not
read implementation bodies from source, installed JavaScript, compiled dist,
source maps, or copied equivalents to infer an integration. Normal package
execution, builds, tests, migrations, and browser use remain part of the workflow.

If a required capability has no documented public entry or its contract is
ambiguous, report the missing capability, the public materials checked, and any
public API error. Stop work that depends on that missing entry; continue
independent business work where possible. Do not create another Audit Store or
query service, intercept plugin-owned routes, or broaden permissions to work
around the missing integration. Framework maintainers handle implementation
diagnosis separately and provide a supported public entry.

## Integration workflow

1. Keep App-specific business code in the App. Reusable plugin code stays in its
   owning plugin. Both use the same public Audit contracts; see
   [workflows](references/workflows.md).
2. Confirm the App registers Audit's client and server plugins, its normal
   migrations prepared every configured store, and the authenticated operator
   has Audit permissions. Default Audit Settings are plugin runtime and require
   no Registry installation. Deployment auditConfig and persistent Settings are
   different: changing defaults does not replace saved policy.
   When the requested feature needs automatic database summaries, select its
   physical tables in the target App's saved policy and read that policy back.
   If the available identity cannot manage Settings, report that specific
   prerequisite; an unexecuted setup instruction does not enable capture.
3. Choose the fact you need: [HTTP declaration](examples/http.ts),
   [explicit runtime phase](examples/runtime.ts), or
   [table selection via Settings API](examples/table-policy.ts).
   Follow [execution and verification](references/examples.md) for prerequisites,
   trusted recorder binding, requests and expected events. Do not copy identity
   from browser input, job payload claims, or model output.
4. Perform the real operation, then query its event through the authorized
   audit/events API or the default Events page. Verify kind, action, outcome,
   actor/initiator, App, store and target; declaration presence is insufficient.
   Use the App's normal test accounts and login entry. For a requested client
   view, also open it as each intended role, including an ordinary object reader,
   and exercise its event list and detail. An API response alone does not verify
   the page or its propagation of the object's query scope.
   Read [permissions and boundaries](references/boundaries.md) before handling
   faults, transactions, disabled capture, raw SQL or background jobs.
5. Only for editable client layout, install the optional events-panel
   [Registry recipe](references/registry.md). It calls the public runtime
   component and does not replace server authorization.

If a capability is unavailable, use [diagnostics](references/diagnostics.md).
Edit this plugin's canonical Skill, never an App's generated .agents copy.
