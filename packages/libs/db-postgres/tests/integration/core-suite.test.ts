import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { postgresDialectIntegrationAdapter } from './legacy-adapter.js';

installDatabaseIntegrationAdapter(postgresDialectIntegrationAdapter);
await import('@nocobase/db-testkit/integration-suite');
