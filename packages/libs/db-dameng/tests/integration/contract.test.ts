import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { damengDialectIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(damengDialectIntegrationAdapter);
