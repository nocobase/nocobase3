import { fileURLToPath } from 'node:url';
import { runDatabaseIntegration } from '@nocobase/db-testkit/integration-runner';

const exitCode = await runDatabaseIntegration({
  name: 'dameng',
  composeFile: fileURLToPath(new URL('../docker-compose.yml', import.meta.url)),
  service: 'dameng',
  containerPort: 5236,
  hostEnvironmentVariable: 'DAMENG_HOST',
  portEnvironmentVariable: 'DAMENG_PORT',
  initServices: ['dameng-init'],
  testEnvironment: { NODE_OPTIONS: '--openssl-legacy-provider' },
});

process.exitCode = exitCode;
