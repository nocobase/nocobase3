import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { oceanbaseIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(oceanbaseIntegrationAdapter);
