# Portal SDK migrations

This guide defines how maintainers publish breaking Portal SDK changes and how
Portal projects adopt them. The SDK version and the Default Template version
are independent SemVer values connected by compatibility metadata.

## Version policy

- Patch SDK releases fix behavior without changing documented APIs.
- Minor SDK releases add backward-compatible APIs.
- Major SDK releases may remove or change documented APIs.
- `nocobase.supportedDefaultTemplateRange` declares the base template versions
  with which that SDK release can run.
- A derived Portal keeps its own package name and version, but preserves the
  exact base release it has incorporated in
  `nocobase.defaultTemplateVersion`.

Do not update `nocobase.defaultTemplateVersion` merely to satisfy the
compatibility check. Update it only after the corresponding base template
changes have actually been merged and verified.

## Choosing the next versions

When an SDK major release does not require template source changes, increment
only the SDK major and declare the template range it genuinely supports.

When a breaking SDK release requires coordinated template source changes, use
a new compatibility generation:

```text
@nocobase/portal-sdk        1.x -> 2.0.0
Default Portal Template     2.x -> 3.0.0
```

The coordinated packages then declare:

```json
// @nocobase/portal-sdk@2.0.0
{
  "nocobase": {
    "supportedDefaultTemplateRange": ">=3.0.0 <4.0.0"
  }
}
```

```json
// Default Portal Template 3.0.0
{
  "nocobase": {
    "defaultTemplateVersion": "3.0.0"
  },
  "dependencies": {
    "@nocobase/portal-sdk": "^2.0.0"
  }
}
```

This generation rule keeps an already-published SDK range truthful. Use a
template minor boundary only when the older SDK remains valid for later
templates in the same template major.

## Maintainer release checklist

1. Increment the SDK major before changing or removing documented APIs.
2. Adapt the base template, Registry source, tests, and examples.
3. Change every affected Registry dependency to the new SDK major range.
4. Set the SDK's minimum supported base template to the first release that
   contains all required adaptations.
5. Add a section below that lists removed APIs, replacements, manual edits, and
   codemods.
6. Build and test the SDK, template, Registry integrations, and packed
   artifacts.
7. Publish the SDK and coordinated template release through the repository
   release workflow.

## Release workflow targets

The release workflow defaults to `auto`. It compares `sdk/` with the latest
`portal-sdk-v*` tag and the rest of the repository with the latest template
`v*` tag, then selects one of these targets:

- `sdk` publishes and tags only the SDK.
- `template` publishes and tags only the template while verifying the installed
  SDK package.
- `both` publishes coordinated SDK and template releases.

When no exact version is supplied, an already-tagged package receives a patch
increment. Supply `sdk_version` or `version` for intentional minor or major
releases. The workflow retains manual target overrides for release recovery and
exceptional maintenance, but normal releases should use automatic detection.

## Portal project upgrade checklist

1. Commit or back up application-owned changes.
2. Read the migration section for every skipped SDK major.
3. Merge the required base template release without overwriting application
   pages, UI composition, translations, or installed extension customizations.
4. Apply API replacements to application code and customized Registry source.
5. Update `nocobase.defaultTemplateVersion` to the base release actually
   incorporated by the project.
6. Update `@nocobase/portal-sdk` to the required major.
7. Run `pnpm sdk:check`, install dependencies, build, and exercise direct URLs,
   authentication, ACL, locale switching, and routed surfaces.

The compatibility checker detects an invalid version combination; it does not
merge template source or rewrite customized application code.

## Current migrations

### Portal SDK 2.0 / Default Template 3.0

This coordinated generation introduces one application-route contract owned by
the Portal runtime. It deliberately removes the temporary compatibility forms
from SDK 1.x.

Removed APIs:

- `AppExtension.appRoutes`;
- `AppExtension.routes` and `AppExtension.dev.routes` as raw React elements;
- Registry-owned `React.lazy`, `Suspense`, and `<Route>` wrappers used only to
  contribute application or development pages.

Replace extension routes with synchronous definitions:

```tsx
const extension: AppExtension = {
  id: "customers",
  routes: defineAppRoutes([
    {
      name: "customers",
      path: "/customers",
      resource: { meta: { label: "Customers" } },
      lazy: () => import("./pages/customers"),
    },
  ]),
  dev: {
    routes: defineAppRoutes([
      {
        name: "development.customers",
        path: "customers",
        lazy: () => import("./demo"),
      },
    ]),
  },
};
```

Each lazy module must default-export a component. Use a `then` mapping when the
page is a named export. Keep resource/action ACL boundaries in the loaded page
module; use route `access.roles` only for centralized role constraints.

Upgrade derived Portals by merging Default Template 3.0 source before changing
`nocobase.defaultTemplateVersion` to `3.0.0` and the Portal SDK dependency to
`^2.0.0`. Update customized installed Registry extensions to the route contract
above, then run `pnpm sdk:check`, the production build, and direct-route, nested
surface, authentication, and ACL verification.
