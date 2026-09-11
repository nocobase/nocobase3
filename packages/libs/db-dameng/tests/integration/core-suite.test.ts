import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { damengDialectIntegrationAdapter } from './adapter.js';

installDatabaseIntegrationAdapter(damengDialectIntegrationAdapter);
await import('./reset-managed-schema.test.js');
await import('@nocobase/db-testkit/integration-suite');
