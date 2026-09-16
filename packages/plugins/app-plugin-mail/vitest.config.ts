import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

export default createReactVitestConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: [
        'client/**/*.{ts,tsx}',
        'server/**/*.ts',
        'shared/**/*.ts',
        'database/**/*.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        lines: 79,
        statements: 76,
        functions: 78,
        branches: 68,
      },
    },
  },
});
