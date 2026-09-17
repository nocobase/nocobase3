import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';

export default createNodeVitestConfig({
  test: {
    include: process.env.QUEUE_TEST_BACKEND
      ? ['tests/integration/**/*.test.ts']
      : [
          'tests/*.test.ts',
          'tests/unit/**/*.test.ts',
          'tests/contracts/**/*.test.ts',
        ],
    fileParallelism: !process.env.QUEUE_TEST_BACKEND,
    passWithNoTests: false,
  },
});
