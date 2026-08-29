import type { AppPluginProviderConstructor } from '@nocobase/app-server-kit/plugins';

import { AuditLogProvider } from './audit-log.js';

const providers: readonly AppPluginProviderConstructor[] = [AuditLogProvider];

export default providers;
