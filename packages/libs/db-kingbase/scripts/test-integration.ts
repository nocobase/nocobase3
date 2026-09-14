import { fileURLToPath } from 'node:url';
import { runDatabaseIntegration } from '@nocobase/db-testkit/integration-runner';

const exitCode = await runDatabaseIntegration({
  name: 'kingbase',
  composeFile: fileURLToPath(new URL('../docker-compose.yml', import.meta.url)),
  service: 'kingbase',
  containerPort: 54321,
  hostEnvironmentVariable: 'KINGBASE_HOST',
  portEnvironmentVariable: 'KINGBASE_PORT',
  testArguments: process.argv.slice(2),
});

process.exitCode = exitCode;
