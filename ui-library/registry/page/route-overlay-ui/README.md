# NocoBase Route Overlay UI

The three ways a child route presents itself over the page that opened it, each at a URL of its own. The item installs into:

```text
client/extensions/nocobase-route-overlay-ui/
```

The application templates ship it preinstalled there. After installation the files belong to the project and may be edited freely.

| Export            | File                              | Purpose                                                                                                           |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `RouteDialog`     | `components/route-dialog.tsx`     | A centered modal dialog.                                                                                          |
| `RouteDrawer`     | `components/route-drawer.tsx`     | A modal panel docked to the right edge of the viewport.                                                           |
| `RouteChildPage`  | `components/route-child-page.tsx` | A non-modal layer covering the content area. The page beneath keeps its DOM, and is made `inert` while covered.   |
| `useRouteOverlay` | `hooks/use-route-overlay.ts`      | `{ close, isClosing }` for the enclosing `RouteDialog` or `RouteDrawer`.                                          |
| `RouteOverlay`    | `components/route-overlay.tsx`    | The implementation behind `RouteDialog` and `RouteDrawer`. Use those two instead; edit this file to restyle both. |

The application owns the routes. Declare each overlay as a child route of its page, render an `Outlet` in that page, and return the overlay from the child route's component:

```tsx
import { RouteDialog } from '@/extensions/nocobase-route-overlay-ui/components/route-dialog';
import { useRouteOverlay } from '@/extensions/nocobase-route-overlay-ui/hooks/use-route-overlay';

function CancelButton() {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button variant='outline' disabled={isClosing} onClick={() => void close()}>
      Cancel
    </Button>
  );
}

export default function NewOrderDialog() {
  return (
    <RouteDialog title='New order' footer={<CancelButton />}>
      {/* form */}
    </RouteDialog>
  );
}
```

`RouteDialog` and `RouteDrawer` take the same props: `title`, `description`, `children`, `footer`, `className`, `closeTo`, where closing navigates and which defaults to the parent route with the current search string, and `beforeClose`, which runs before every close — the close button, Escape, the backdrop and `useRouteOverlay().close()` alike — and keeps the overlay open when it resolves `false`. An overlay opened from another overlay renders at the outer one's `Outlet`, gets its own backdrop, and returns focus into the outer panel when it closes.

Call `useRouteOverlay()` from a component rendered inside the overlay, such as a footer button. The page component that returns `<RouteDialog>` sits outside the overlay's provider, and the hook throws there.

`RouteChildPage` positions itself with `absolute inset-0`, so the element that contains it must be positioned; an application's content area is. Render its `Outlet` beside the page's `PageContainer` rather than inside it, and give the child page a `PageContainer` of its own. It has no close button: the breadcrumb above it, or the browser's back button, returns to the page beneath.

## Translations

The close button's accessible name is translated with `useTranslation()` from `@nocobase/i18n/client` under `routeOverlay.close`, with `Close` as its default. The item ships the key in `locales/en-US.ts` and `locales/zh-CN.ts`; spread each into the matching locale file of the namespace that renders the item, before your own keys so that yours can reword them. Installing the item does not do this, and without it the button is named `Close` in every language. The application templates keep the key directly in their own `client/locales/`.
