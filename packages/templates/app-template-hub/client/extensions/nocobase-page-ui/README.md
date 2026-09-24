# NocoBase Page UI

The frame and heading every NocoBase page is built from. The item installs into:

```text
client/extensions/nocobase-page-ui/
```

The application templates ship it preinstalled there. After installation the files belong to the project and may be edited freely.

| Export          | File                            | Purpose                                                                                                                                                                                                                            |
| --------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageContainer` | `components/page-container.tsx` | A `section` with the full width, the responsive padding (`p-6 md:p-8`) and the spacing between sections (`space-y-6`). Accepts every `section` prop; `className` is merged with `tailwind-merge`, so it can override the defaults. |
| `PageHeader`    | `components/page-header.tsx`    | The page's only `h1`, an optional `description`, and `actions` aligned to the right from the `sm` breakpoint up.                                                                                                                   |

```tsx
import { PageContainer } from '@/extensions/nocobase-page-ui/components/page-container';
import { PageHeader } from '@/extensions/nocobase-page-ui/components/page-header';

export default function OrdersPage() {
  return (
    <PageContainer>
      <PageHeader
        title='Orders'
        description='Track every order from checkout to delivery.'
        actions={<Button>New order</Button>}
      />
      {/* sections */}
    </PageContainer>
  );
}
```

A page renders one `PageContainer`. Content that renders inside another page — an inline child route, a tab panel — already sits in that page's container and adds none of its own. A covering child page from `route-overlay-ui` is a surface of its own and places a `PageContainer` inside `RouteChildPage`; a dialog or drawer brings its own padding.

The item renders no text of its own, so it has no translations. It depends on `tailwind-merge` alone, installs no shadcn primitives, and has no `@/` imports, so a plugin compiles it as installed.
