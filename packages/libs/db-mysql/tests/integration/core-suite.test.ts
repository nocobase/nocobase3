import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { mysqlDialectIntegrationAdapter } from './legacy-adapter.js';

installDatabaseIntegrationAdapter(mysqlDialectIntegrationAdapter);
await import('./reset-managed-schema.test.js');
await import('@nocobase/db-testkit/integration-suite');
