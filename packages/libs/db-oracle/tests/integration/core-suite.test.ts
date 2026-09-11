import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { oracleDialectIntegrationAdapter } from './legacy-adapter.js';

installDatabaseIntegrationAdapter(oracleDialectIntegrationAdapter);
await import('./reset-managed-schema.test.js');
await import('@nocobase/db-testkit/integration-suite');
