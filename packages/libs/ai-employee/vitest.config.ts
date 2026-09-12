import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';

export default createNodeVitestConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
