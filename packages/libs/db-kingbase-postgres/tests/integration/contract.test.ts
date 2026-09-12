import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { kingbasePostgresIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(kingbasePostgresIntegrationAdapter);
