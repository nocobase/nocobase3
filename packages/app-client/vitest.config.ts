import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

export default createReactVitestConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router'],
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
