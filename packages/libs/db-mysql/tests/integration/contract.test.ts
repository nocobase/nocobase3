import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { mysqlIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(mysqlIntegrationAdapter);
