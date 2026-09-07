# Application-owned audit panel

Import AuditEventsPanel from this directory's index.tsx and pass
query={{ store: 'main' }} in an existing App-owned page. The App must register
Audit's client and server plugins and render through its normal AppClientRoot
with API client, theme and locales. The user needs the server-enforced Audit
and target resource permissions. A query filter grants no access.

Edit this wrapper's layout and presentation in the App. The public runtime
component loads events through the authenticated App API client; keep backend
policy and authorization in the plugin. No extension or route is auto-created.
Default Audit Settings work without this item. Materialize does not install
dependencies or enable plugins.

Ownership is application; upgradePolicy is three-way-merge. Compare canonical
upstream, original installed source and local edits before applying upgrades.
The tool does not perform that merge automatically.
