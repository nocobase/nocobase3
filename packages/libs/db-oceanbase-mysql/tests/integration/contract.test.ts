import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { oceanbaseMysqlIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(oceanbaseMysqlIntegrationAdapter);
