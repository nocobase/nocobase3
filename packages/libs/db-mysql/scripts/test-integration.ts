import { runDatabaseIntegration } from '@nocobase/db-testkit/integration-runner';
import {
  integrationService,
  mariadbIntegrationService,
} from './integration-service.js';

// One server after the other, never at once: see "Database Integration Test Scheduling" in AGENTS.md.
let exitCode = 0;
for (const service of [integrationService, mariadbIntegrationService]) {
  const code = await runDatabaseIntegration({
    ...service,
    testArguments: process.argv.slice(2),
  });
  if (exitCode === 0) exitCode = code;
}

process.exitCode = exitCode;
