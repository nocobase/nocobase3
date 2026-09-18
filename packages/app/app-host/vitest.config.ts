import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';
import { configDefaults } from 'vitest/config';

export default createNodeVitestConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
    restoreMocks: true,
  },
});
