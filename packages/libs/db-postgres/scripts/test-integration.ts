import { fileURLToPath } from 'node:url';
import { runDatabaseIntegration } from '@nocobase/db-testkit/integration-runner';

const exitCode = await runDatabaseIntegration({
  name: 'postgres',
  composeFile: fileURLToPath(new URL('../docker-compose.yml', import.meta.url)),
  service: 'postgres',
  containerPort: 5432,
  hostEnvironmentVariable: 'POSTGRES_HOST',
  portEnvironmentVariable: 'POSTGRES_PORT',
});

process.exitCode = exitCode;
