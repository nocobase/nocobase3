import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';

const integrationFiles: Record<string, string[]> = {
  inMemory: [],
  redis: ['redis-connection', 'redis-contract'],
  cluster: ['redis-cluster'],
  postgres: ['postgres-*'],
  postgres13: ['postgres-*'],
};
const backend = process.env.QUEUE_TEST_BACKEND;
if (backend && !(backend in integrationFiles))
  throw new Error(`Unknown integration backend: ${backend}`);
export default createNodeVitestConfig({
  test: {
    include: backend
      ? [
          'tests/integration/infrastructure.test.ts',
          ...integrationFiles[backend]!.map(
            (name) => `tests/integration/${name}.test.ts`,
          ),
        ]
      : [
          'tests/*.test.ts',
          'tests/unit/**/*.test.ts',
          'tests/contracts/**/*.test.ts',
          'tests/backends/**/*.test.ts',
        ],
    fileParallelism: !process.env.QUEUE_TEST_BACKEND,
    passWithNoTests: false,
    typecheck: {
      enabled: !process.env.QUEUE_TEST_BACKEND,
      include: ['tests/types/**/*.test-d.ts'],
      tsconfig: 'tsconfig.tests.json',
    },
  },
});
