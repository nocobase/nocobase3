# Diagnostics

First reproduce the operation and inspect its authorized API response, event and
receipt. Check persisted enabled/source/table/store policy and migration readiness.
Missing storage is AUDIT_NOT_READY; wrong transaction binding is
AUDIT_TRANSACTION_MISMATCH. A normal request may succeed despite degraded optional
observation, so response success alone does not establish event persistence.

Provider defaults and updated source do not prove that existing persisted
permission sets or table policy changed. Read back the current configuration and
ordinary user permissions. Apply deliberate provisioning or migration changes
through supported APIs, preserving administrator changes; do not blindly replace
existing grants or assume an initialization path ran again.

After rebuilding or reinstalling a local plugin, confirm that the running App
loaded that artifact. A development watcher may not reload installed packages.
Compare the owned process start time with the artifact update and, when needed,
restart that App in a controlled way before repeating the same request. Preserve
the original response and record the restart; a passing isolated consumer does
not prove that an older running process uses the same code.

If declarations or Skills are missing, the existing plugin:inspect,
server:inspect and client:inspect commands can inspect composition. They are
read-only structural aids; consistent:true proves neither capture nor permissions.
There is no dedicated audit CLI. Do not invent a new SkillManager, deep-import
private modules, read internal fact tables from browser code, or edit generated
.agents Skill copies to work around missing public behavior.

Creating a resource adapter does not register it. Resolve
`auditResourceAdaptersToken` from the current App container, register the adapter
in the owner Provider boot phase, and dispose that registration during shutdown;
see [the public registration example](../examples/resource-adapter.ts). If the
installed version lacks this documented entry, report that gap; do not install
a parallel Store/query layer or shadow the official API. Granting readAll is not
a remedy for an object-scoped reader who should only see authorized business
objects.
