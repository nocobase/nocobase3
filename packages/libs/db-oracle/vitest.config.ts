import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';

export default createNodeVitestConfig({
  test: {
    // Oracle DDL touches shared data dictionary tables and must not run in
    // parallel against the same integration schema.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
