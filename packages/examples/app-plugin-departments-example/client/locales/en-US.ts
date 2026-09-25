import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  navigation: {
    organization: 'Organization',
    directory: 'Department directory',
  },
  organization: {
    title: 'Organization',
    description:
      'Departments and their members. Permission sets assigned to a department in Authorization reach its members and the members of every department below it.',
    tree: 'Departments',
    newTitle: 'Title of a new top-level department',
    add: 'Add department',
    enable: 'Enable',
    disable: 'Disable',
    disabled: 'Disabled',
    empty: 'No departments yet.',
    select: 'Select a department to manage its members.',
    loading: 'Loading…',
    failed: 'The organization could not be loaded.',
    forbidden: 'You cannot view the organization.',
    retry: 'Retry',
    saveFailed: 'The change could not be saved.',
  },
  department: {
    notFound: 'This department does not exist.',
    parent: 'Parent: {{title}}',
    topLevel: 'Top-level department',
    childTitle: 'Title of a new sub-department',
    addChild: 'Add sub-department',
    members: 'Members',
    noMembers: 'No direct members.',
    primary: 'Primary',
    setPrimary: 'Make primary',
    remove: 'Remove',
    searchUsers: 'Search users to add',
    addMember: 'Add',
    noUsers: 'No matching users.',
  },
  directory: {
    title: 'Department directory',
    description:
      'The departments your permissions let you see: those you belong to and any shared with you.',
    empty: 'No departments are visible to you.',
    failed: 'The directory could not be loaded.',
    forbidden: 'You cannot view the directory.',
    retry: 'Retry',
  },
};

/**
 * English is the source of truth for this plugin's locale shape.
 */
export type DepartmentsExampleResource = LocaleResource<typeof enUS>;

export default enUS;
