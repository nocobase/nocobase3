import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { mssqlIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(mssqlIntegrationAdapter);
