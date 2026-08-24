# Authentication UI customization

This directory owns the Default App's authentication presentation. The enabled
`@nocobase/app-plugin-authentication` plugin still owns the guest route IDs,
paths, AuthProvider, session behavior, redirects, and reusable forms.

The application replaces only each route's lazy page component through
`page-overrides.ts`. Do not add another `/login`, `/register`,
`/forgot-password`, or `/reset-password` route.

| Task                                                    | File                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Change the logo or product name                         | `components/auth-brand.tsx`                                        |
| Change columns, spacing, or shared page layout          | `components/auth-layout.tsx`                                       |
| Change marketing copy or artwork                        | `components/auth-marketing-panel.tsx`                              |
| Change a page title, description, links, or composition | `pages/*-page.tsx`                                                 |
| Change which plugin route uses an application page      | `page-overrides.ts`                                                |
| Add a completely custom login form                      | Use Refine `useLogin()` in an application component                |
| Change the authentication protocol                      | Change server auth configuration or create a dedicated auth plugin |

Prefer the stable public exports from:

```ts
import {
  AuthLink,
  ForgotPasswordForm,
  LoginForm,
  RegisterForm,
  ResetPasswordForm,
} from '@nocobase/app-plugin-authentication/client/ui';
```

Do not import the plugin's internal `client/forms`, `client/components`, or
`client/pages` paths. Those are implementation details. Keep page loaders lazy
and list their source paths as `componentEntry` values so
`pnpm app:client:inspect` can report final ownership.
