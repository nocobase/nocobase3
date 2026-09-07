# Permissions and boundaries

Audit page access is not a generic page grant. audit/capabilities controls menus
only; each API independently enforces Audit and target permissions. Event list
requires audit.events read/readAll for the server-derived App/scope/store identity
(auditPermissionId is exported by the server entry). Details with safe metadata
may require readMetadata. Target queries additionally require resource access;
missing resource adapters deny access, and deleted targets require readDeleted.
Settings requires audit.settings read/manage and complete store visibility.
Client query filters and Registry components grant no permissions. There is no
public event-create/update/delete API. Grant through the application's real
permission management; never copy server ACL into a recipe.

A business page embedding Audit components still needs its own host page access.
Page access, business record access and Audit event access are separate grants;
one does not provide the others. Verify the actual ordinary user permissions
through the public authorization API and the page itself. Do not broaden record
or Audit permissions to compensate for a missing page grant.

The trusted host owns actor, initiator, App/security scope and correlation IDs.
An unauthenticated request is anonymous; missing runtime scope is unknown, never
implicitly system. A workflow child changes actor but preserves trusted initiator.
A recorder binding is a server capability, not validation of untrusted identity.
Background trace hints require verification against trusted job state.

Record receipts: committed is persisted; pending-commit joins the caller's active
transaction; disabled/excluded is explicitly not captured. Invalid events,
wrong-store handles and writes fail with stable errors. Do not suppress these as
successful audit delivery.

For optional audit integration, disabled/excluded is not a business failure.
Keep the domain result separate from the capture receipt: do not roll back a
successful optional business operation or retry it indefinitely merely because
capture is disabled. An actual persistence error or an explicitly required audit
contract has different failure semantics; follow that contract rather than
treating every non-committed receipt as the same error.

Runtime/HTTP observations cannot undo external effects,
do not replay payments or emails on observation failure, and do not guarantee
zero loss on forced process termination. Required startup checks can reject a
misconfigured App before admission; the host probe proves host finalization only.

Managed query writes selected by persistent table policy append their database
summary atomically on the exact connection, including rollback-only on summary
failure. They do not collect raw SQL, external client writes, row snapshots,
Record History, before/after, diffs, or restore operations. Separate business and
request events remain separate facts. No cross-database atomicity is promised.

Stores and required-source constraints are deployment auditConfig; enabled,
observationStore, selected tables and retention are persisted Settings with CAS.
Tables start empty and require explicit selection. Disabled capture or uninstall
keeps history. Daily UTC cleanup reads persistent policy; null retention does not
delete. Shortening retention requires explicit confirmation. Selectable stores
must be migrated and ready. File inventory capture does not automatically cover
unassembled custom file route factories. CLI work without App scope is unobserved.
