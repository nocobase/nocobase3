# Optional client recipe

Default Settings belong to the plugin runtime. No Registry is needed to query or
configure audit. For an editable App-owned layout, use events-panel. It imports
AuditEventsView only from @nocobase/app-plugin-audit/client/components and accepts
the same public props. Render within the App's normal providers and registered
Audit client locales. Backend authorization and event loading remain runtime code.

From a source workspace:

    pnpm registry build --package @nocobase/app-plugin-audit
    pnpm registry materialize --package @nocobase/app-plugin-audit       --item events-panel --output-root /absolute/path/to/your-app

Choose an actual independent App directory; the target must not already exist.
Materialize does not install dependencies, register plugins or merge changes.
Import AuditEventsPanel from client/extensions/nocobase-audit-events-panel in an
existing App-owned page and pass query={{store:'main'}}. No route is auto-added.
Edit that wrapper, typecheck/build the App, and load it as an authorized user.
Confirm its network request reaches the real audit/events endpoint; unauthorized
users must still receive 401/403 regardless of layout changes.

Canonical source/config and built public/r JSON ship with the plugin. npm
publication does not host the JSON over HTTP. Upgrades require a three-way
comparison of canonical upstream, originally installed and locally edited source;
the ownership metadata does not promise automatic merging.
