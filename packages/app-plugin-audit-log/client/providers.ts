import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

import { AuditLogProvider } from './components/provider.js';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [
    {
      name: 'audit-log',
      component: AuditLogProvider,
    },
  ],
);

export default providers;
