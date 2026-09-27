# Frontend testing

## Where tests go

```text
tests/components/   Component tests: rendering and interaction of pages and components (Vitest, jsdom)
tests/logic/        Logic tests: route declarations, pure functions, providers (Vitest)
e2e/                End-to-end tests against a running application (Playwright); create the directory with the first test
```

Tests never go beside the source. Vitest discovers `tests/**/*.test.{ts,tsx}` (`vitest.config.ts`); Playwright discovers `e2e/**/*.test.ts` (`playwright.config.ts`). Use `e2e/` only for what needs a real server and database, such as a flow across the browser and the API or a server-side permission check seen from the page. Everything else is a component or logic test.

## What to test

| What changed          | Test at least                                                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page or component     | What it renders in each state (loading, empty, no results, failed) and what happens after an interaction: the request sent, the state change, the toast, the error shown where the action started                                                                                                                     |
| Overlay (child route) | Opening its URL renders the overlay over the parent; closing returns to the parent URL with the query kept; `beforeClose` blocks closing while submitting                                                                                                                                                             |
| Route declarations    | `tests/logic/client-routes.test.ts`, updated as [section 12 of `page.md`](page.md#12-update-the-route-test) describes                                                                                                                                                                                                 |
| Copy                  | `tests/logic/app-locale-coverage.test.ts` passes: every key the application's code passes to `t()` or names as a route `title`, and every dynamic key family, exists in both locale files. Wording is checked in the browser; a component test renders real text only when the copy itself is the behavior under test |
| A bug fix             | A test that fails before the fix and passes after it, when jsdom can reproduce the bug                                                                                                                                                                                                                                |

## Building the test harness

**For a page, copy `tests/components/page-harness.test.tsx`.** It renders a small list page with a child-route `RouteDialog` in a memory router, and mocks exactly what a page needs: `useApiClient` (keeping the real `ApiClientError`), `useCan`, `useTranslation` with `useLocale`, and `toast`, all created with `vi.hoisted`. Its tests are the shapes to repeat: the request the page sends, a 403 without "Retry", a 401 that offers "Sign in again", an action shown with permission and hidden without it, and a child route opened from its URL and closed back to the list. It also mocks `useAuthentication` for the 401 case. Replace its inline page with your page and its child routes, keep the setup, and put the file in `tests/components/` (the template's own overlay test happens to sit in `tests/logic/`).

For anything else, start from the test that already sets it up:

- **Real translations in both languages**: `tests/components/auth-i18n.test.tsx` creates an `I18nRuntime` (`@nocobase/i18n`) with the application namespace `app`, registers the application's `client/locales/index.ts` (imported as `index.js`), initializes it in `en-US` and renders inside `I18nProvider` (`@nocobase/i18n/client`); `changeLanguage('zh-CN')` inside `act` switches the language. Use it when the copy itself is under test; otherwise mock `t` as the page harness does, because outside an `I18nProvider` `t()` returns keys.
- **Overlay behavior in depth** (`beforeClose`, nested layers, focus): `tests/logic/route-overlay.test.tsx`.
- **An existing component with `defaultValue` copy**: `tests/components/data-table.test.tsx`, whose `t` mock fills `{{name}}` placeholders into the default value.

- Assert what the user can see: text, roles and accessible names, the result of a click (`@testing-library/react`, `@testing-library/user-event` and the jest-dom assertions are set up). Do not assert internal state.
- When a button contains a `Spinner`, the spinner's "Loading" label becomes part of the button's name, so use a regular expression when you query by name.
- A `Button` rendered as a `Link` (`nativeButton={false}`) has the `button` role, not `link`; query "New project" with `getByRole('button', …)`. Test an absence together with the presence case, as the harness does, so the assertion can fail.
- jsdom does not lay out the page or run an input method. Leave layout, narrow screens and IME input to the browser check (the screenshot tool, [`../scripts/capture.md`](../scripts/capture.md)), and do not simulate pointer geometry for hover menus (see [section 2 of `shell.md`](shell.md#2-header-icon-buttons)).
- A Vite server that a test starts itself (including one started by a helper) must use its own temporary `cacheDir`, deleted afterward. Do not delete or rebuild the dependency cache of a running development server; lazily loaded pages then stop working until the server is restarted.

## Running tests

Run only the related test files, then lint them: `tests/` is outside every tsconfig and only ESLint checks it (`e2e/` is covered by `tsconfig.node.json`):

```bash
pnpm exec vitest run <related-test-files>
```

```bash
pnpm exec eslint --max-warnings 0 <related-test-files>
```

`vitest.config.ts` sets `passWithNoTests: true`, so a mistyped or missing path prints "No test files found" and exits 0 without running anything. Confirm that the summary line counts every file you named (`Test Files  N passed (N)`).

End-to-end tests run against a running application. `playwright.config.ts` sets no `baseURL` or `webServer`, so start `pnpm dev` first and have each test read the application URL, including the deployment base path, from `APP_URL` (defaulting to the `Local:` URL `pnpm dev` prints, such as `http://127.0.0.1:13000/main/`). Sign in once, not in every test. The template's `playwright.config.ts` has neither of the two settings this needs, so add them: `globalSetup: './e2e/global-setup.ts'`, whose default export opens `/login`, signs in with a development account read from `E2E_USERNAME` and `E2E_PASSWORD` (so no credentials are committed) and saves the context's `storageState` to `storage/e2e/auth.json`, which `storage/` keeps out of git; and `use: { storageState: 'storage/e2e/auth.json' }` in the config. Tests then create and remove their own data with `page.request`, which sends the same session cookie:

```bash
pnpm test:e2e
```
