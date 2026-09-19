import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { postgresIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(postgresIntegrationAdapter);
