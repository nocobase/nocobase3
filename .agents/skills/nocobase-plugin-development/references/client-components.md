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

Use the shared theme contract for all plugin UI: [theme tokens](theme-tokens.md). Prefer its color, typography, spacing, radius, shadow, and motion utilities so plugin UI responds to the target App's theme.

## Copy page and route components into the plugin

Copy the required source from the sections below into `<plugin>/client/components/` and maintain it as plugin-owned code. Reuse an existing plugin copy before adding another. The examples are self-contained source references; no App template files are required.

| Need                     | Source in this guide                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page spacing             | [PageContainer](#pagecontainer)                                                                                                                       |
| Page heading and actions | [PageHeader](#pageheader)                                                                                                                             |
| Route dialog or drawer   | [Overlay context and hook](#overlay-context-and-hook), [RouteOverlay](#routeoverlay), and [RouteDialog and RouteDrawer](#routedialog-and-routedrawer) |

Copy the overlay implementation and its hook together, retaining one plugin-local Context instance for both wrappers. Include only the wrappers needed by the feature. Resolve their transitive imports against plugin-owned shadcn primitives and utilities, including `ui/dialog`, `ui/button`, and `lib/utils`; generate missing primitives using the workflow above. The source below already uses relative `.js` imports and explicit types for declaration output. Declare imported Client runtime packages as peers. Keep these copies private unless an approved public export is required.

Copy the components' translation keys into the plugin's own `client/locales/` resources and register the lazy locale manifest in its Client declaration; see [internationalization](i18n.md). In particular, `route-overlay.tsx` uses `actions.close`: supply this key in every supported plugin language (for example, `Close` in English and `关闭` in Chinese). Do not rely on the host App providing the same key. Under the plugin's own route, the copied overlay inherits the plugin namespace; if it is intentionally exported for another owner to render, bind that namespace explicitly as described in the internationalization guide.

The page examples in this Skill assume these copies already exist. Nested pages adjust the relative path to the same plugin-owned components. The host App's private breadcrumb component is excluded from this copy workflow because it reads an App-owned route Context; do not copy that Context or import the host's routing internals.

Verify copied components with the plugin's lint, typecheck, tests and build, then exercise them in the target App. For overlays, cover direct URLs, closing, nested Context ownership, keyboard interaction and unsaved-change guards.

### PageContainer

`client/components/page-container.tsx`:

```tsx
import type { ComponentProps, ReactElement } from 'react';
import { cn } from '../lib/utils.js';

export type PageContainerProps = ComponentProps<'section'>;

export function PageContainer({
  className,
  ...props
}: PageContainerProps): ReactElement {
  return (
    <section
      className={cn('w-full space-y-6 p-6 md:p-8', className)}
      {...props}
    />
  );
}
```

### PageHeader

`client/components/page-header.tsx`:

```tsx
import type { ReactElement, ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}

export function PageHeader({
  actions,
  description,
  title,
}: PageHeaderProps): ReactElement {
  return (
    <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
      <div className='min-w-0'>
        <h1 className='font-heading text-3xl font-semibold tracking-[-0.035em]'>
          {title}
        </h1>
        {description ? (
          <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className='flex shrink-0 items-center gap-2'>{actions}</div>
      ) : null}
    </header>
  );
}
```

### Overlay context and hook

`client/components/use-route-overlay.ts`:

```ts
import { createContext, useContext, type Context } from 'react';

interface RouteOverlayContextValue {
  close: () => Promise<void>;
  isClosing: boolean;
}

/** Internal context shared by both route overlay components. */
export const RouteOverlayContext: Context<RouteOverlayContextValue | null> =
  createContext<RouteOverlayContextValue | null>(null);

export function useRouteOverlay(): RouteOverlayContextValue {
  const value = useContext(RouteOverlayContext);
  if (!value) {
    throw new Error(
      'useRouteOverlay must be used inside RouteDialog or RouteDrawer',
    );
  }
  return value;
}
```

### RouteOverlay

`client/components/route-overlay.tsx`:

```tsx
import {
  createContext,
  useContext,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import { useLocation, useNavigate, type To } from 'react-router';
import {
  Dialog,
  DialogOverlay,
  DialogClose,
  DialogPortal,
  DialogDescription,
  DialogTitle,
} from './ui/dialog.js';
import { RouteOverlayContext } from './use-route-overlay.js';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useTranslation } from '@nocobase/i18n/client';
import { XIcon } from 'lucide-react';
import { Button } from './ui/button.js';
import { cn } from '../lib/utils.js';

export interface RouteOverlayProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeTo?: To;
  beforeClose?: () => boolean | Promise<boolean>;
  className?: string;
}

// Lets an overlay rendered through another overlay's outlet return focus into
// the enclosing panel. Two overlays reached by one URL mount in the same
// commit, so the nested one never observes the parent panel taking focus and
// would otherwise fall back to `document.body`.
const ParentPopupContext =
  createContext<RefObject<HTMLDivElement | null> | null>(null);

/** Plugin-owned presentation; route registration stays unchanged. */
export function RouteOverlay({
  title,
  description,
  children,
  footer,
  closeTo,
  beforeClose,
  className,
  drawer = false,
}: RouteOverlayProps & { drawer?: boolean }): ReactElement {
  const { t } = useTranslation();
  const parentPopup = useContext(ParentPopupContext);
  const popupRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const [closingLocation, setClosingLocation] = useState<
    typeof location | null
  >(null);
  const isClosing = closingLocation === location;
  const pendingRef = useRef<Promise<void> | null>(null);
  const generationRef = useRef(0);

  // A still-mounted parent can change location while its confirmation is pending.
  // Invalidate that request as well as requests from an unmounted route.
  useLayoutEffect(() => {
    generationRef.current += 1;
    pendingRef.current = null;
    return () => {
      generationRef.current += 1;
    };
  }, [location]);

  const close = useCallback((): Promise<void> => {
    if (pendingRef.current) return pendingRef.current;
    const requestGeneration = generationRef.current;
    setClosingLocation(location);
    const request = Promise.resolve()
      .then(async () => {
        const allowed = beforeClose ? await beforeClose() : true;
        if (allowed && generationRef.current === requestGeneration) {
          await navigate(
            closeTo ?? { pathname: '..', search: location.search, hash: '' },
            { relative: 'route', replace: true },
          );
        }
      })
      .finally(() => {
        if (generationRef.current === requestGeneration) {
          pendingRef.current = null;
          setClosingLocation(null);
        }
      });
    pendingRef.current = request;
    return request;
  }, [beforeClose, closeTo, location, navigate]);
  const value = useMemo(() => ({ close, isClosing }), [close, isClosing]);

  return (
    <RouteOverlayContext.Provider value={value}>
      {/* Covers the panel body too, so an overlay placed at this page's outlet
          finds the enclosing panel without knowing where the outlet lives. */}
      <ParentPopupContext.Provider value={popupRef}>
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open)
              void close().catch((error: unknown) => {
                console.error('Failed to close route overlay', error);
              });
          }}
        >
          <DialogPortal>
            {/* Each nested panel needs its own backdrop above its parent panel. */}
            <DialogOverlay forceRender />
            <DialogPrimitive.Popup
              ref={popupRef}
              finalFocus={() => {
                const previous = previousFocusRef.current;
                if (parentPopup?.current) {
                  return previous?.isConnected &&
                    parentPopup.current.contains(previous)
                    ? previous
                    : parentPopup.current;
                }
                return true;
              }}
              className={cn(
                'fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover text-popover-foreground shadow-lg outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
                'flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl',
                // The viewport constraints are deliberate; all ordinary styling uses theme tokens.
                drawer &&
                  'top-0 right-0 left-auto h-svh max-h-svh w-full max-w-full translate-x-0 translate-y-0 rounded-none sm:max-w-xl data-open:slide-in-from-right data-open:zoom-in-100',
                className,
              )}
            >
              <header className='shrink-0 space-y-2 border-b p-4 pr-12'>
                <DialogTitle>{title}</DialogTitle>
                {description != null && (
                  <DialogDescription>{description}</DialogDescription>
                )}
              </header>
              <div className='min-h-0 flex-1 overflow-y-auto p-4'>
                {children}
              </div>
              {footer != null && (
                <footer className='flex shrink-0 flex-wrap justify-end gap-2 border-t p-4'>
                  {footer}
                </footer>
              )}
              <DialogClose
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    className='absolute top-2 right-2'
                  />
                }
              >
                <XIcon />
                <span className='sr-only'>{t('actions.close')}</span>
              </DialogClose>
            </DialogPrimitive.Popup>
          </DialogPortal>
        </Dialog>
      </ParentPopupContext.Provider>
    </RouteOverlayContext.Provider>
  );
}
```

### RouteDialog and RouteDrawer

`client/components/route-dialog.tsx`:

```tsx
import type { ReactElement } from 'react';

import { RouteOverlay, type RouteOverlayProps } from './route-overlay.js';

export type RouteDialogProps = RouteOverlayProps;

export function RouteDialog(props: RouteDialogProps): ReactElement {
  return <RouteOverlay {...props} />;
}
```

`client/components/route-drawer.tsx`:

```tsx
import type { ReactElement } from 'react';

import { RouteOverlay, type RouteOverlayProps } from './route-overlay.js';

export type RouteDrawerProps = RouteOverlayProps;

export function RouteDrawer(props: RouteDrawerProps): ReactElement {
  return <RouteOverlay {...props} drawer />;
}
```

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
