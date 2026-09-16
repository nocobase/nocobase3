export default {
  navigation: { title: 'Default Access' },
  defaultAccess: {
    supportedScope:
      'Only resource types that support data scopes are shown. Configure the default record scope for each action here.',
    groupFilter: 'Resource group',
    allGroups: 'All groups',
    inlineHint:
      'Simple changes save immediately. Configure and save specific scopes in the drawer.',
    saved: 'Saved',
    editScope: 'Edit scope',
    back: 'Back to default access',

    configureResource: 'Configure resource',
    configure: 'Configure',
    chooseResource: 'Choose a resource to configure its default record scopes.',
    configured: 'Configured',
    noDefault: 'No default scope',
    customScope: 'Specific scope',

    page: {
      title: 'Default Access',
      description:
        'Default access expands the baseline record scope for users with the relevant action permission. It does not grant action or field permissions; sharing and restriction rules also apply.',
    },
    search: 'Search rules',
    create: 'Set default access',
    recordAccessHeader: 'Default record access',
    allowedActions: 'Allowed actions',
    emptyNone:
      'No default access configured. Permission sets and other rules determine access.',
    emptySearch: 'No default access rules match your search.',
    pagerLabel: 'Default access rules',
    editTitle: 'Edit default access',
    newTitle: 'Set default access',
    editorDescription:
      'Define the baseline record visibility before sharing and restrictions are applied.',
    resourceHeading: 'Resource',
    resourceDescription:
      'Choose the collection whose baseline access is being set.',
    accessHeading: 'Access by action',
    accessDescription: 'Set the record scope independently for each action.',
    deleteRule: 'Delete rule',
    save: 'Save default access',
    confirmDeleteTitle: 'Remove this default configuration?',
    confirmDeleteBody:
      'Delete the default access rule for “{{resource}}”. Remaining permission sets and rules determine access.',
  },
};
