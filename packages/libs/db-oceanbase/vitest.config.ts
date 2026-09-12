import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';

export default createNodeVitestConfig({
  test: {
    // Integration files share one MySQL database and must not run DDL concurrently.
    fileParallelism: false,
  },
});
