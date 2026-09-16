import type { LocaleResource } from '@nocobase/i18n';

/**
 * Display vocabulary shared by the client and server locale catalogues.
 */
const enUS = {
  options: {
    actions: {
      read: 'Read',
      create: 'Create',
      update: 'Update',
      delete: 'Delete',
      access: 'Access',
    },
    resourceTypes: {
      page: 'Pages',
      collection: 'Database collections',
      settings: 'Admin settings',
    },
    settingsModules: { authorization: 'Authorization' },
    pages: {
      all: 'All pages',
      allDescription:
        'Allow access to every page, including pages added later.',
    },
    settings: {
      'permission-sets': 'Permission Sets',
    },
    subjectTypes: {
      authenticated: 'All signed-in users',
      authenticatedDescription:
        'Applies to every user with a valid signed-in session.',
      user: 'Users',
    },
    recordAccessPolicies: {
      allRecords: 'All Records',
      recordsIOwn: 'Records I Own',
      recordsICreated: 'Records I Created',
      customFilter: 'Custom Filter',
      customFilterHint: 'Select records with a custom filter condition.',
    },
  },
};

/** English is the source of truth for this catalogue's shape. */
export type AuthorizationServerResource = LocaleResource<typeof enUS>;

export default enUS;
