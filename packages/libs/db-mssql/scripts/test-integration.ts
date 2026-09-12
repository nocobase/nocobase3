import { fileURLToPath } from 'node:url';
import { runDatabaseIntegration } from '@nocobase/db-testkit/integration-runner';

const exitCode = await runDatabaseIntegration({
  name: 'mssql',
  composeFile: fileURLToPath(new URL('../docker-compose.yml', import.meta.url)),
  service: 'mssql',
  containerPort: 1433,
  hostEnvironmentVariable: 'MSSQL_HOST',
  portEnvironmentVariable: 'MSSQL_PORT',
  initServices: ['mssql-init'],
});

process.exitCode = exitCode;
