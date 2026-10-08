// @vitest-environment node
import path from 'node:path';

import { describeMigration } from '@nocobase/app-testing/server';
import type { MigrationSource } from '@nocobase/db';

const sources: readonly MigrationSource[] = [
  {
    packageName: '@nocobase/app-plugin-agents',
    directory: path.resolve(import.meta.dirname, '../database/migrations'),
  },
];

describeMigration('202610080001_ag_add_model_service_headers', {
  sources,
  up: async ({ expectCollection }) => {
    const services = expectCollection('agModelServices');
    await services.toHaveField('headers', { nullable: false });
    await services.toHaveField('headersEncrypted', { nullable: true });
    await services.toHaveField('sessionHeader', { nullable: true });
  },
  down: async ({ expectCollection }) => {
    const services = expectCollection('agModelServices');
    await services.toExist();
    await services.not.toHaveField('headers');
    await services.not.toHaveField('headersEncrypted');
    await services.not.toHaveField('sessionHeader');
  },
});
