import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  errors: {
    databaseUnavailable: 'This application is configured without a database.',
    connectionNotFound: 'This connection is not configured.',
    connectionUnreachable: 'This connection could not be read.',
    collectionNotFound: 'This collection does not exist on this connection.',
    forbidden: 'Database Explorer access is required.',
  },
};

export type DatabaseExplorerResource = LocaleResource<typeof enUS>;

export default enUS;
