# ESLint flat config

The ESLint export uses ESLint 10 flat config, `@eslint/js`,
`typescript-eslint` recommended type-checked rules with project service,
`@eslint-react`, React Hooks, React Refresh, Vitest, and
`eslint-config-prettier`.

## Factories

- `createNodeLibraryConfig` applies Node globals to source files.
- `createClientLibraryConfig` applies browser and React rules, with Node globals
  for scripts and configuration files.
- `createPortalConfig` scopes browser and React rules to `client`, `registry`,
  and tests, and scopes Node globals to `server`, scripts, and config files.

All factories accept:

- `tsconfigRootDir`: the package directory used by TypeScript project service;
- `ignores`: additional global ignore patterns;
- `rules`: local rules applied after the shared rules;
- `overrides`: flat-config objects applied after local rules;
- `environment`: additional environment config objects.

```js
import { createPortalConfig } from "@nocobase/dev-config/eslint";

export default createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ["public/vendor/**"],
  overrides: [
    {
      files: ["scripts/**/*.ts"],
      rules: {
        "no-console": "off",
      },
    },
  ],
});
```

Pass `import.meta.dirname` from each package. Project service then discovers the
nearest local tsconfig without a cross-package project glob.

## Composable segments

Advanced configurations can compose the exported `base`, `typescript`,
`typeChecked`, `node`, `react`, and `vitest` arrays. `typeChecked` is the
default in the factories; use `typescript` only when type-aware linting is
intentionally unavailable.

The shared global ignores cover build output, coverage, generated content, and
test artifacts. React and Vitest rules are scoped to their relevant files.
