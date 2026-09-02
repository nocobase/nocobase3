# Testing and verification

## Where tests go

```text
tests/logic/        Logic and integration tests
tests/components/   Component tests
e2e/                Tests needing a real server, real auth, or a real database
```

**Never put a test beside the source it covers.** Name files `*.test.ts` or `*.test.tsx`.

`vitest.config.ts` lists included test files explicitly. A new file under `tests/` is not picked up until it is added there — a test that never runs looks exactly like a test that passes.

## What to test, by change

| You changed         | Test at least                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------- |
| A server route      | Anonymous → `401`, authenticated but unpermitted → `403`, permitted → expected payload      |
| A public webhook    | Missing signature, invalid signature, valid signature, duplicate delivery                   |
| A migration         | `up` produces the expected schema; `down` reverses it; against a real database              |
| A seed              | First run, run against existing data, repeat run                                            |
| A service           | Its domain behavior, with its dependencies supplied directly                                |
| A job               | `execute()` with a realistic payload; a second run is harmless; failures behave as intended |
| A page or component | What renders and what happens on interaction                                                |
| A route declaration | Path, auth mode, and that `componentLoader()` actually resolves                             |
| Translations        | Both languages render real text                                                             |

## Testing a route

Call the real contribution's `createRouter()` with a container holding test doubles, then issue real requests. This exercises the production factory, including its dependency resolution and middleware:

```ts
const container = new ServiceContainer();
container.instance(authenticationToken, testAuth);

const router = await apiRoutes.createRouter({
  appName: 'main',
  publicBasePath: '/main',
  config: { app: { name: 'main', publicBasePath: '/main' } },
  paths: createConfigPaths({ rootDir: '/missing' }),
  router: new Hono(),
  container,
});

const response = await router.request('/orders');
expect(response.status).toBe(401);
```

Do not add a `registerRoutes(router, ...)` helper just to make a route testable. It moves the security boundary out of the thing you are testing.

## Testing components

`@testing-library/react` with jsdom is configured, and jest-dom matchers are already installed. Assert what a user can observe — visible text, roles, what a click does — not internal state.

## Testing migrations

Run against a real test database. A test that only imports the migration file proves nothing about the schema it produces. Verify tables, columns, types, indexes, and constraints after `up`, then run `down` and verify cleanup.

## Before finishing

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm check` runs all of these plus formatting.

Then verify the actual behavior. Green commands mean the code compiles and the assertions you wrote hold — not that the feature works:

- Open the page and use it, in both light and dark themes.
- Confirm the endpoint's responses for signed-out, unpermitted, and permitted callers.
- Confirm `pnpm migrate` applies cleanly.
- Switch language and confirm the text changes.

## Diagnostics

```bash
pnpm server:config          # Resolved configuration, paths, providers
pnpm client:inspect --json  # Resolved client composition
pnpm server:inspect --json  # Resolved server composition
```

Reach for these when a contribution does not appear where you expect. They read static declarations: they do not run providers, execute route factories, load page components, render anything, or touch the database.

**A clean inspection is not evidence of correctness.** `consistent: true` means the wiring the command observed has no contradictions — it says nothing about whether the route is secure or the feature works. Never present an inspection as verification.

## Reporting

Say what you ran, what passed, and what you did not run. If you could not verify something — no test database, a flow needing real credentials — say so rather than implying it was checked.
