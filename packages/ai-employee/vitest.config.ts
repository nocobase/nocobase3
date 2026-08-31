import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';

export default createNodeVitestConfig({
  test: {
    maxWorkers: 1,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
