import type { LocaleResource } from '@nocobase/i18n';

/**
 * The vocabulary the server owns: everything the options endpoint names before
 * it sends the options down as plain strings.
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
      settings: 'Authorization settings',
    },
    pages: {
      all: 'All pages',
      allDescription:
        'Allow access to every page, including pages added later.',
    },
    settings: {
      'permission-sets': 'Permission Sets',
      'default-access': 'Default Access',
      'sharing-rules': 'Sharing Rules',
      'restriction-rules': 'Restriction Rules',
    },
    subjectTypes: {
      authenticated: 'All signed-in users',
      authenticatedDescription:
        'Applies to every user with a valid signed-in session.',
      user: 'Specific user',
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
