# Vitest factories

Use the Node factory for server packages:

```js
import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';

export default createNodeVitestConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

Use the React factory for browser components:

```js
import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

export default createReactVitestConfig({
  resolve: {
    alias: {
      '@': new URL('./client', import.meta.url).pathname,
    },
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
```

The React factory installs the React Vite plugin, uses JSDOM, loads
`@testing-library/jest-dom/vitest`, and runs Testing Library `cleanup` after
every test. Local setup files are merged with the shared setup.

Both factories set `testTimeout` and `hookTimeout` to 30 seconds, well above
Vitest's 5-second default. CI runs every package's suite in parallel on one
shared runner, so a test that finishes in well under a second locally can take
several seconds there, and the default turns ordinary growth into a timeout
failure. A package that needs a different value sets its own `testTimeout`,
which takes precedence over the shared one.

Aliases, include patterns, coverage provider and output, thresholds, and other
package-specific behavior stay in the local configuration. The shared presets
do not impose coverage thresholds.

Both presets inline `@boringnode/queue` so its dynamic task imports pass through Vitest's TypeScript transformation and share the test's module registry. Externalizing this loader lets Node import application `.ts` files directly, which fails on syntax that needs transformation, such as constructor parameter properties. Keep this setting when extending either preset.
