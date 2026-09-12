import { fileURLToPath } from 'node:url';
import { runDatabaseIntegration } from '@nocobase/db-testkit/integration-runner';

const exitCode = await runDatabaseIntegration({
  name: 'mysql',
  composeFile: fileURLToPath(new URL('../docker-compose.yml', import.meta.url)),
  service: 'mysql',
  containerPort: 3306,
  hostEnvironmentVariable: 'MYSQL_HOST',
  portEnvironmentVariable: 'MYSQL_PORT',
  testArguments: process.argv.slice(2),
});

process.exitCode = exitCode;
