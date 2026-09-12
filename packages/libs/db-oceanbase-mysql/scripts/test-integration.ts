import { fileURLToPath } from 'node:url';
import { runDatabaseIntegration } from '@nocobase/db-testkit/integration-runner';

const exitCode = await runDatabaseIntegration({
  name: 'oceanbase-mysql',
  composeFile: fileURLToPath(new URL('../docker-compose.yml', import.meta.url)),
  service: 'oceanbase',
  containerPort: 2881,
  hostEnvironmentVariable: 'OCEANBASE_MYSQL_HOST',
  portEnvironmentVariable: 'OCEANBASE_MYSQL_PORT',
  initServices: ['oceanbase-init'],
});

process.exitCode = exitCode;
