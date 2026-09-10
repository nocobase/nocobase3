import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { mysqlDialectIntegrationAdapter } from './legacy-adapter.js';

installDatabaseIntegrationAdapter(mysqlDialectIntegrationAdapter);
await import('@nocobase/db-testkit/integration-suite');
