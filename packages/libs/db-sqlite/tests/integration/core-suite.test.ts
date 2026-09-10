import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { sqliteDialectIntegrationAdapter } from './adapter.js';

installDatabaseIntegrationAdapter(sqliteDialectIntegrationAdapter);
await import('@nocobase/db-testkit/integration-suite');
