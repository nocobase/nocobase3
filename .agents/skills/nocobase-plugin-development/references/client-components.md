# Client Components and shadcn/ui

Use this reference for plugin-owned pages, React Providers, reusable component exports, and internal UI. A component becomes part of runtime behavior only when a Route loads it, a React Provider renders it, another module imports it, or the package exposes it through a public export; there is no `client.components` contribution.

## Decide component ownership first

| Component kind            | Assembled by                                     | Source owner                              |
| ------------------------- | ------------------------------------------------ | ----------------------------------------- |
| Page                      | Route `componentLoader()`                        | Plugin, unless the App overrides the page |
| React tree wrapper        | `defineClientReactProviders()`                   | Plugin                                    |
| Public reusable component | App or another plugin importing a package export | Plugin API                                |
| Internal component        | Another module inside the plugin                 | Plugin implementation                     |
| Registry component        | Target App after materialization                 | App                                       |

This ownership determines which import aliases, UI primitives, locales, dependencies, exports, tests, and upgrade rules apply.

## Start common UI with shadcn/ui

Before implementing buttons, inputs, forms, selects, dialogs, sheets, tables, tabs, tooltips, dropdown menus, and similar common patterns, check shadcn/ui and generate the matching primitive into the plugin. Use ordinary semantic HTML for document structure and Tailwind utilities for composition, but do not hand-build a duplicate interactive primitive when shadcn provides one.

shadcn/ui distributes source rather than a shared NocoBase runtime package. Runtime UI used by a plugin belongs to that plugin under `client/components/ui/`, is published with the plugin, and must not import the target App's `client/components/ui/`. Registry items use a different ownership model: once materialized, their source belongs to the App and may import the App's `@/components/ui/*`.

When a plugin first needs shadcn components, add a plugin-local `components.json` using the repository's `base-nova` style:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "client/styles.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle"
}
```

Provide the generation entrypoint at `client/styles.css`:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';

/* Generation entrypoint only. The host application owns the theme tokens. */
```

Point the plugin's TypeScript alias at its own Client source so the CLI can generate files:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./client/*"]
    }
  }
}
```

The alias supports generation and local type resolution only. TypeScript does not rewrite it in emitted JavaScript, and a target App's `@/` alias points to that App rather than to a compiled plugin. After generation, change every runtime internal import to an explicit relative `.js` path, including imports from `client/components/ui/` and `client/lib/`.

Keep `shadcn`, `tailwindcss`, and `tw-animate-css` in `devDependencies`. Put packages imported as values by the generated Client source in `peerDependencies`, commonly `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, and `lucide-react` when used. Use the workspace catalog entries and remove generated dependencies that the retained source does not import.

Run the CLI from the plugin directory and add only primitives required by the current feature:

```bash
cd packages/plugins/app-plugin-audit-log
pnpm exec shadcn add button card dialog
```

Do not use `--overwrite` over customized primitives without reviewing and accepting the diff. The [Registry example components.json](../../../../packages/examples/app-plugin-registry-example/components.json), [generation stylesheet](../../../../packages/examples/app-plugin-registry-example/client/styles.css), and [adapted Button source](../../../../packages/examples/app-plugin-registry-example/client/components/ui/button.tsx) are the maintained source-generation example.

## Adapt generated source for a published plugin

Generated shadcn source targets application source by default. Before treating it as plugin runtime source:

- Replace `@/` imports with relative `.js` imports that remain valid below `dist/client/`.
- Give exported components, functions, constants, props, and default parameters explicit types suitable for declaration output.
- Preserve accessible names, focus behavior, disabled state, keyboard interaction, and theme-responsive classes.
- Remove unused generated files and peer dependencies.
- Keep CSS side effects explicit; use `sideEffects: false` only when every published module is genuinely free of import-time side effects.

Use the shared theme contract for all plugin UI: [theme tokens](../../../../packages/app/app-skills/skills/nocobase-app-development/references/theme-tokens.md). Prefer its color, typography, spacing, radius, shadow, and motion utilities so plugin UI responds to the target App's theme.

## Compose business components

Use semantic HTML for structure, plugin-owned shadcn primitives for interaction, and the shared Tailwind theme tokens for layout and visual hierarchy:

```tsx
import type { ReactElement } from 'react';

import { Button } from './ui/button.js';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from './ui/card.js';

export interface AuditSummaryProps {
  readonly onViewRecords: () => void;
  readonly total: number;
}

export function AuditSummary({
  onViewRecords,
  total,
}: AuditSummaryProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit records</CardTitle>
        <CardAction>
          <Button variant='outline' onClick={onViewRecords}>
            View records
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className='text-2xl font-semibold'>{total}</p>
      </CardContent>
    </Card>
  );
}
```

Keep a component private unless the App or another package needs a stable import. Public components should be exposed through an intentional subpath such as `./client/components`, backed by a barrel and matching source and `publishConfig.exports`; consumers must not deep-import `src/`, private folders, or unpublished files.

A public component's contract includes props, render semantics, accessibility, theme integration, namespace behavior, peer dependencies, and export path. Update its types, behavioral tests, user-facing integration guidance, and changeset when that contract changes.

## Keep page modules lazy

Route declarations load page modules instead of statically importing them in `client/plugin.ts`:

```ts
componentLoader: () => import('./pages/audit-log-page.js');
```

The page module must default-export a React component. Use a route component override when an App changes only the page UI; do not redeclare the plugin-owned route identity, path, authentication, or access metadata.

## Bind translations by render ownership

A component rendered under its own plugin Route or React Provider inherits that contribution's package namespace. A public component rendered by an App or another plugin sits in the consumer's render scope, so bind the plugin namespace explicitly with `useTranslation(PLUGIN_NS)` or `withNamespace(PLUGIN_NS, Component)`.

Explicit namespace binding selects resources but does not register them. A component-only package must either receive App-owned copy through props or provide a locales-only Client plugin factory that the target App explicitly registers. See [i18n.md](./i18n.md).

## Verify components at their public boundary

- Test user-visible behavior, keyboard and pointer interaction, accessible names, loading, empty, and error states.
- Import public components from their official package subpath in export tests.
- Invoke page `componentLoader()` and assert that it resolves a default component.
- Run the plugin's focused `lint`, `typecheck`, `test`, and `build`; use pack checks when exports or published files change.
- Exercise the component in the target App when the behavior depends on the real theme, application services, React Providers, routes, or locale composition.

Components do not appear as independent entries in `client:inspect`; the Route or React Provider that assembles them does. Validate component behavior through types, exports, tests, build output, and the target App.
