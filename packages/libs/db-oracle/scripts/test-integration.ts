import { fileURLToPath } from 'node:url';
import { runDatabaseIntegration } from '@nocobase/db-testkit/integration-runner';

const exitCode = await runDatabaseIntegration({
  name: 'oracle',
  composeFile: fileURLToPath(new URL('../docker-compose.yml', import.meta.url)),
  service: 'oracle',
  containerPort: 1521,
  hostEnvironmentVariable: 'ORACLE_HOST',
  portEnvironmentVariable: 'ORACLE_PORT',
  testArguments: process.argv.slice(2),
});

process.exitCode = exitCode;
