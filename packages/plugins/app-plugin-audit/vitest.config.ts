import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';
import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

const components = createReactVitestConfig({
  test: {
    name: 'components',
    environment: 'node',
    include: ['tests/components/**/*.test.tsx'],
  },
});
const setup = components.test?.setupFiles;
components.test = {
  ...components.test,
  setupFiles: [
    './tests/components/events-dom.mjs',
    ...(Array.isArray(setup) ? setup : setup ? [setup] : []),
  ],
  sequence: { setupFiles: 'list' },
};

export default createNodeVitestConfig({
  test: {
    projects: [
      createNodeVitestConfig({
        test: { name: 'server', include: ['tests/**/*.test.ts'] },
      }),
      components,
    ],
  },
});
