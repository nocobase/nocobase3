import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';

const connections = (
  process.env.INTEGRATION_DB_CONNECTIONS ??
  process.env.DB_CONNECTION ??
  'sqlite'
)
  .toLowerCase()
  .split(',')
  .map((name) => name.trim());
const includesMssql = connections.some((name) =>
  ['all', 'mssql', 'sqlserver', 'sql-server', 'tedious'].includes(name),
);

export default createNodeVitestConfig({
  test: {
    // Independent SQL Server DDL fixtures contend on shared system catalogs.
    // Explicit concurrency tests still run concurrent operations within a test.
    fileParallelism: !includesMssql,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'dist/**',
        'tests/**',
        'src/**/index.ts',
        'src/**/types.ts',
        'src/database/connection.ts',
        'src/database/internal/knex/config.ts',
        'src/metadata/store.ts',
        'src/naming/strategy.ts',
      ],
    },
  },
});
