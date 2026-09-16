export default {
  navigation: { title: 'Restriction Rules' },
  restrictionRules: {
    page: {
      title: 'Restriction Rules',
      description:
        'Restriction rules narrow access, limiting the records selected users reach without granting anything by themselves.',
    },
    notice:
      'Restriction rules only narrow existing access. They never grant permission on their own.',
    search: 'Search restriction rules',
    create: 'New restriction rule',
    ruleHeader: 'Rule',
    appliesToHeader: 'Applies to',
    restrictedActionsHeader: 'Restricted actions',
    allowedScopeHeader: 'Allowed scope',
    emptyNone:
      'No restriction rules yet. Create one to narrow what selected users reach.',
    emptySearch: 'No restriction rules match your search.',
    pagerLabel: 'Restriction rules',
    editTitle: 'Edit restriction rule',
    newTitle: 'New restriction rule',
    editorDescription: 'Limit the effective record scope for an audience.',
    ruleHeading: 'Basic information',
    ruleDescription: 'Name the rule and choose the collection to restrict.',
    ruleName: 'Rule name',
    assignmentsHeading: 'Applies to',
    assignmentsDescription: 'Choose who is subject to this restriction.',
    reason: 'Description',
    accessHeading: 'Actions and record scope',
    accessDescription:
      'Set the maximum record scope independently for each action.',
    deleteRule: 'Delete rule',
    save: 'Save restriction rule',
    confirmDeleteTitle: 'Delete this restriction rule?',
    confirmDeleteBody:
      'Delete restriction rule “{{title}}”. Remaining permission sets and rules determine access.',
  },
};
