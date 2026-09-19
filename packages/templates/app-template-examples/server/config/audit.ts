import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import { databaseManagerToken } from '@nocobase/db';
import type { AuditConfig } from '@nocobase/app-plugin-audit/server';
import { createCustomerAuditWriter } from '@nocobase/app-plugin-audit-example/server';

const audit: AppConfigFactory<AuditConfig> = defineAppConfig(() => ({
  createWriter: (services) => ({
    writer: createCustomerAuditWriter(services.resolve(databaseManagerToken)),
  }),
}));
export default audit;
