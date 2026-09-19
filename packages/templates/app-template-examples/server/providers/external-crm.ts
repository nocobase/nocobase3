import { mkdirSync } from 'node:fs';
import path from 'node:path';

import type { Application } from '@nocobase/app-server/application';
import type { AppDatabaseConfig } from '@nocobase/app-server/database';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { ensureExternalCrmSampleDatabase } from './external-crm-sample.js';

/**
 * Makes the external CRM example runnable out of the box. In production the
 * `externalCrm` connection points at a database another system owns and this
 * provider does nothing; when it points at the local SQLite stand-in, the
 * provider plays the part of that system and creates the tables and sample
 * rows the example reads.
 */
export default class ExternalCrmProvider extends ServiceProvider<Application> {
  public readonly name = 'app/external-crm';

  public override async boot(): Promise<void> {
    if (!this.app.container.has(databaseManagerToken)) return;
    const crm =
      this.app.config.get<AppDatabaseConfig>('database')?.connections
        .externalCrm;
    if (!crm || crm.schemaManagement !== 'external' || crm.dialect !== 'sqlite')
      return;
    // The foreign system would have created its database file long before this
    // application started; for the stand-in, do that here.
    if (
      'filename' in crm &&
      typeof crm.filename === 'string' &&
      crm.filename !== ':memory:'
    ) {
      mkdirSync(path.dirname(crm.filename), { recursive: true });
    }
    const database = this.app.container.resolve(databaseManagerToken);
    await ensureExternalCrmSampleDatabase(database.connection('externalCrm'));
  }
}
