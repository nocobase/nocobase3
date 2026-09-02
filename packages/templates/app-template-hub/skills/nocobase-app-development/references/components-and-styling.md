# Components and styling

The UI is shadcn/ui primitives, composed into application components, styled with Tailwind semantic tokens.

## Use shadcn/ui

Check `client/components/ui/` first. If the primitive you need is not there, add it from the shadcn registry:

```bash
pnpm exec shadcn add card
pnpm exec shadcn add dialog table badge
```

The CLI writes into `client/components/ui/`, which is where `components.json` points. Adding a primitive is the first choice — do not hand-write a button, dialog, or select that shadcn already publishes, and do not copy one out of another project.

To see what a primitive offers before adding it:

```bash
pnpm exec shadcn view card             # the source it would write
pnpm exec shadcn docs card             # docs and example links
pnpm exec shadcn search @shadcn -q dialog   # find one by keyword
```

`search` takes a registry namespace and a `-q` query, not a bare component name.

## Compose upward

`client/components/ui/` holds primitives. Build your own components on top of them and put those in `client/components/`.

```tsx
// client/components/order-summary.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function OrderSummary({ order }: OrderSummaryProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{order.reference}</CardTitle>
      </CardHeader>
      <CardContent className='text-muted-foreground'>...</CardContent>
    </Card>
  );
}
```

Do not reimplement a primitive's behavior — focus, keyboard handling, and ARIA wiring are already correct in the shadcn component and easy to get wrong by hand.

`@/` resolves to `client/`.

## Style with semantic tokens

Use the tokens, not literal colors:

| Use                                        | Not                           |
| ------------------------------------------ | ----------------------------- |
| `bg-background`, `bg-card`, `bg-muted`     | `bg-white`, `bg-gray-50`      |
| `text-foreground`, `text-muted-foreground` | `text-black`, `text-gray-600` |
| `border-border`, `border-input`            | `border-gray-200`             |
| `bg-primary`, `text-primary-foreground`    | `bg-blue-600`, `text-white`   |
| `bg-destructive`, `text-destructive`       | `bg-red-500`                  |

Tokens are defined in `client/styles.css` for both themes. A literal color looks fine in whichever theme you happened to be viewing and breaks in the other — this is the most common styling defect in this codebase.

## Consistency is application-wide

**The application must look like one product.** Before writing a component, look at how nearby pages handle the same problem: spacing scale, heading sizes, card versus plain section, where actions sit. Match it.

**If a change genuinely calls for a different look, change it everywhere.** Edit the design tokens in `client/styles.css`, or update the shared component every page uses, so the whole application moves together.

**Never restyle only the part you are working on.** A page with its own spacing scale, its own button treatment, or its own palette is a defect. If you believe the application's style should change, say so and change it globally — do not fork the look of one page.

## Dark mode

Both themes come from the same tokens, so using them correctly means dark mode already works. `client/theme/` owns the theme provider and the System/Light/Dark selector.

Check both themes before finishing. `dark:` variants are for the rare case a token cannot express; reaching for them often means a literal color slipped in.

## Icons

`lucide-react` is the icon library. Size them with the `size-4` scale rather than fixed pixels so they track the text they sit beside.

## Loading, empty, and error states

Every view that fetches data needs all three. `client/components/loading.tsx` is the shared spinner. Put loading feedback inside the surface that is loading — a page-level spinner rendered for a dialog's content appears behind the dialog rather than inside it.

## Text

Every user-visible string goes through a translation key. See [internationalization](i18n.md).

## Tailwind scanning

`tailwind.config.mjs` scans this application's client source plus the client directories of installed `@nocobase` packages, resolving pnpm symlinks. You do not need to register new files in it — a new component under `client/` is scanned automatically.

## Verify

- Both light and dark themes render correctly.
- The page's spacing, typography, and components match its neighbours.
- No literal color classes.
- Interactive elements are reachable and operable by keyboard.
- Loading, empty, and error states all render.
