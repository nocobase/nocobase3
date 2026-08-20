# Vitest factories

Use the Node factory for server packages:

```js
import { createNodeVitestConfig } from "@nocobase/dev-config/vitest/node";

export default createNodeVitestConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

Use the React factory for browser components:

```js
import { createReactVitestConfig } from "@nocobase/dev-config/vitest/react";

export default createReactVitestConfig({
  resolve: {
    alias: {
      "@": new URL("./client", import.meta.url).pathname,
    },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
```

The React factory installs the React Vite plugin, uses JSDOM, loads
`@testing-library/jest-dom/vitest`, and runs Testing Library `cleanup` after
every test. Local setup files are merged with the shared setup.

Aliases, include patterns, coverage provider and output, thresholds, and other
package-specific behavior stay in the local configuration. The shared presets
do not impose coverage thresholds.
