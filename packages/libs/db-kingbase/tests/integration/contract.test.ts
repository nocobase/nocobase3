import { definePortableIntegrationContracts } from '@nocobase/db-testkit';
import { kingbaseIntegrationAdapter } from './adapter.js';

definePortableIntegrationContracts(kingbaseIntegrationAdapter);
