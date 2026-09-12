import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { oracleIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(oracleIntegrationAdapter);
