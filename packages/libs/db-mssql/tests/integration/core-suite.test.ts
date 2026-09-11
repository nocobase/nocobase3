import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { mssqlDialectIntegrationAdapter } from './legacy-adapter.js';

installDatabaseIntegrationAdapter(mssqlDialectIntegrationAdapter);
await import('./reset-managed-schema.test.js');
await import('@nocobase/db-testkit/integration-suite');
