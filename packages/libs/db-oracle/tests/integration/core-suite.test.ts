import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { oracleDialectIntegrationAdapter } from './legacy-adapter.js';

installDatabaseIntegrationAdapter(oracleDialectIntegrationAdapter);
await import('@nocobase/db-testkit/integration-suite');
