import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  navigation: {
    departments: 'Departments',
  },
  // One name for the settings entry, the permission workspace and the subject type.
  departments: 'Departments',
  authz: {
    read: 'View',
    update: 'Manage',
  },
  // Titles of the seeded departments, stored as translation descriptors.
  seed: {
    trading: 'Example Trading Co.',
    executiveOffice: 'Executive Office',
    salesCenter: 'Sales Center',
    northSales: 'North Sales',
    southSales: 'South Sales',
    deliveryCenter: 'Delivery Center',
    delivery: 'Delivery',
  },
  subject: {
    disabled: 'Disabled',
  },
  regions: {
    none: 'No region',
    North: 'North',
    South: 'South',
    West: 'West',
  },
  page: {
    description:
      'Departments and their members. A permission set, sharing rule or restriction rule assigned to a department in Authorization reaches its members and the members of every department below it.',
    loading: 'Loading departments…',
    failed: 'The departments could not be loaded.',
    forbidden: 'You do not have permission to view departments.',
    retry: 'Retry',
  },
  notice: {
    title: 'Example feature',
    body: 'This page is provided by the example plugin {{packageName}} and is not a default application feature. Organisation structures differ between companies, so build your own as needed.',
    skill:
      'See the Skill nocobase-app-development → references/organization.md.',
  },
  tree: {
    label: 'Department tree',
    search: 'Search departments',
    empty: 'No departments yet.',
    noMatch: 'No departments match your search.',
    addRoot: 'Add top-level department',
    addChild: 'Add sub-department to {{title}}',
    rename: 'Rename {{title}}',
    disable: 'Disable {{title}}',
    enable: 'Enable {{title}}',
    disabled: 'Disabled',
  },
  details: {
    choose: 'Select a department to see its members and details.',
    notFound: 'This department does not exist.',
    tabs: 'Department sections',
    members: 'Members',
    basic: 'Basic info',
  },
  members: {
    name: 'Name',
    email: 'Email',
    primaryColumn: 'Primary department',
    primary: 'Primary',
    actions: 'Actions',
    empty: 'This department has no direct members yet.',
    loading: 'Loading members…',
    failed: 'The members could not be loaded.',
    setPrimary: 'Make primary',
    setPrimaryNamed: 'Make this the primary department of {{name}}',
    remove: 'Remove',
    removeNamed: 'Remove {{name}}',
    removeTitle: 'Remove member',
    removeBody: '{{name}} leaves {{department}} and loses what it passes down.',
    add: 'Add member',
    search: 'Search users by name or email',
    searching: 'Searching…',
    noUsers: 'No matching users.',
    alreadyMember: 'Member',
  },
  basic: {
    title: 'Title',
    parent: 'Parent department',
    topLevel: 'None (top level)',
    region: 'Region',
    regionHint:
      'Members of a department with a region are synchronised into the sales example as working in that region.',
    active: 'Status',
    enabled: 'Enabled',
    disabled: 'Disabled',
    save: 'Save',
    saved: 'Saved.',
    readOnly: 'You can view these details but not change them.',
  },
  dialog: {
    createTitle: 'Add department',
    createChildTitle: 'Add a sub-department to {{title}}',
    renameTitle: 'Rename department',
    titleLabel: 'Title',
    create: 'Add',
    save: 'Save',
    cancel: 'Cancel',
    disableTitle: 'Disable department',
    disableBody:
      'Members of {{title}} and of every department below it stop inheriting what is assigned to them until it is enabled again.',
    disable: 'Disable',
  },
  errors: {
    DEPARTMENT_NOT_FOUND: 'The department no longer exists.',
    DEPARTMENT_EXISTS: 'A department with this id already exists.',
    PARENT_NOT_FOUND: 'The parent department no longer exists.',
    PARENT_CYCLE: 'A department cannot be moved below itself.',
    USER_NOT_FOUND: 'The user does not exist or is disabled.',
    MEMBER_NOT_FOUND: 'The user is no longer a member of this department.',
    INVALID_INPUT: 'Check the values and try again.',
    FORBIDDEN: 'You do not have permission to do this.',
    requestFailed: 'The request failed. Try again.',
  },
};

/**
 * English is the source of truth for this plugin's locale shape.
 */
export type DepartmentsExampleResource = LocaleResource<typeof enUS>;

export default enUS;
