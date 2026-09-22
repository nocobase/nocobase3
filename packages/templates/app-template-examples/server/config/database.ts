import { defineAppDatabaseConfig } from '@nocobase/app-server/database';

/** Installed official drivers are loaded synchronously when first needed. */
export default defineAppDatabaseConfig(({ paths }) => ({
  default: 'main',
  connections: {
    main: {
      dialect: 'sqlite',
      filename: paths.storage('database.sqlite'),
      schemaManagement: 'managed',
      debug: false,
    },
    analytics: {
      dialect: 'sqlite',
      filename: paths.storage('analytics.sqlite'),
      schemaManagement: 'managed',
      migrations: { autoRun: true },
      seeds: { autoRun: true },
    },
    /**
     * An existing database owned by another system. `external` means
     * NocoBase reads its schema but never changes it: the Builder refuses
     * DDL on this connection and no migrations or seeds run against it.
     * Table names carry the CRM's `crm_` prefix, which `naming` strips when
     * mapping them to logical Collection names. Everything the schema cannot
     * express — titles, descriptions, which column is a relation — is read
     * from `database/externalCrm/collections/<name>/metadata.json`, the
     * default metadata source for an external connection; edit those files
     * and rerun `pnpm collections:generate`. Point this at the real CRM in
     * production; the SQLite file is a stand-in that
     * `server/providers/external-crm.ts` fills with sample data.
     */
    externalCrm: {
      dialect: 'sqlite',
      filename: paths.storage('external-crm.sqlite'),
      schemaManagement: 'external',
      naming: { underscored: true, tablePrefix: 'crm_' },
    },
  },
}));
