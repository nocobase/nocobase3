import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { sqliteIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(sqliteIntegrationAdapter);
