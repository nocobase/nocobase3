import { fileURLToPath } from 'node:url';
import { runDatabaseIntegration } from '@nocobase/db-testkit/integration-runner';

const exitCode = await runDatabaseIntegration({
  name: 'kingbase-postgres',
  composeFile: fileURLToPath(new URL('../docker-compose.yml', import.meta.url)),
  service: 'kingbase',
  containerPort: 54321,
  hostEnvironmentVariable: 'KINGBASE_POSTGRES_HOST',
  portEnvironmentVariable: 'KINGBASE_POSTGRES_PORT',
});

process.exitCode = exitCode;
