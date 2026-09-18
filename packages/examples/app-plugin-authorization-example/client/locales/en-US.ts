export default {
  practice: {
    intro:
      'Use the accounts below instead of an administrator. Administrators bypass the restrictions. Each exercise starts from the seeded record state.',
    read: {
      title: 'Read-only access and selected sharing',
      steps:
        'Sign in as sales_assistant: Projects shows project-1, project-2 and project-3, but no edit actions. Quotes and orders remain limited to the owned project.',
      reason:
        'Project sharing grants records for viewing only; it grants neither editing nor related records. Confidential project-4 stays excluded.',
    },
    scopes: {
      title: 'Two independent submission scopes',
      steps:
        'Sign in as sales_engineer: submit quote-2 successfully; quote-5 is disabled because a colleague prepared it; quote-6 is disabled because its project is in another region.',
      reason:
        'Quote preparer and project region are checked independently. Existing orders reference separate accepted quotes; submitting a practice quote does not create an order.',
    },
    teams: {
      title: 'Team handover and revocation',
      steps:
        'Sign in as sales_proposal and submit quote-7. After resetting records, remove only the project scope from the Proposal team handover rule as an administrator and retry: submission is denied. Restore the project scope for project-3 to permit it again.',
      reason:
        'quote-7 belongs to a colleague and project-3 is outside the team region, so both shared scopes are necessary. Removing team membership or its engineer role also denies submission. sales_coordinator keeps its direct manager role after membership removal. sales_dispatch demonstrates delivery inherited from its team.',
    },
  },
  reset: {
    action: 'Reset practice records',
    cancel: 'Cancel',
    confirm:
      'Restore the seeded projects, quotes and orders for every demo account? Changes to those records will be overwritten.',
    description:
      'An administrator can reset business records here before repeating an exercise or switching delivery accounts. Accounts, memberships and permission settings are preserved; restore any authorization changes manually.',
    done: 'Practice records restored. Refresh any open record lists.',
  },

  teams: {
    subject: 'Teams',
    handover: 'Proposal team quote handover',
    title: 'Roles and team authorization',
    direct: 'Direct assignment',
    inherited: 'Inherited from team',
    proposal: 'Proposal team',
    delivery: 'Delivery team',
    combined: 'Direct project manager + sales engineer from proposal team',
    coverage:
      'Verify menus, operations, fields, independent scopes, defaults, user and team sharing, restrictions and revocation.',
  },
  rules: {
    public: 'Exclude confidential projects',
    delivery: 'Orders assigned to the delivery team',
    projects: 'Shared example projects',
  },
  accountMenus: {
    assistant: 'Projects, quotes and orders (read only)',
    engineer:
      'Projects, quotes and orders; submit own quotes for regional projects',
    manager: 'Manage owned projects; quotes and orders are read only',
    delivery: 'Orders only; confirm regional deliveries',
  },
  sales: {
    saveFirst: 'Save changes before submitting.',
    states: {
      draft: 'Draft',
      submitted: 'Submitted',
      accepted: 'Accepted',
      ready: 'Ready',
      delivered: 'Delivered',
    },
    errors: {
      session: 'Session expired. Sign in again.',
      input: 'Check the amount and required fields.',
      conflict: 'The record state changed. Refresh before trying again.',
      request: 'Request failed. Check your connection and try again.',
    },

    operation: {
      outsideScope: 'Outside permitted operation scope',
      notReady: 'Only ready orders can be delivered',

      allowed: 'Within submission scope',
      notGranted: 'Read only — operation not granted',
      quoteScope: 'Outside permitted quote scope',
      projectScope: 'Project outside permitted scope',
      notDraft: 'Only drafts can be submitted',
      invalidAmount: 'Amount must be positive',
    },
    preparedBy: 'Prepared by',
    parentProject: 'Project',
    sourceQuote: 'Source quote',
    relationships: 'Related records',
    relatedQuotes: 'Project quotes',
    relatedOrders: 'Project orders',
    filtered: 'Filtered by',
    clearFilter: 'Clear filter',
    noPageAccess: 'No page access',
    descriptions: {
      projects:
        'Open related quotes and orders from a project. Related lists show only records this account can access.',
      quotes:
        'A project can have several quotes. Submission checks project scope and quote preparer independently, then validates draft status and amount.',
      orders:
        'Each order references its source quote and project. Delivery accounts only enter Orders; references do not grant access to other pages or records.',
    },

    delivery: 'Delivery',
    orders: 'Orders',
    editProject: 'Edit project information',
    editQuote: 'Edit pricing',
    submit: 'Submit quote',
    submitScopes: {
      projects: 'Projects linked to the quotes',
      quotes: 'Quotes allowed for submission',
    },
    deliver: 'Confirm delivery',
    amount: 'Amount',
    status: 'Status',
    deliveryReference: 'Delivery reference',

    group: 'Sales collaboration',
    title: 'Sales permissions example',
    projects: 'Projects',
    quotes: 'Quotes',
    view: 'View',
    edit: 'Edit notes',
    intro:
      'Fictional records demonstrate feature permissions, operation scopes, default access, sharing and restrictions.',
    record: 'Record',
    notes: 'Notes',
    save: 'Save',
    refresh: 'Refresh',
    loading: 'Loading…',
    empty: 'No accessible records',
    readOnly: 'Read only',
    saved: 'Saved',
    scope: {
      prepared: 'Quotes prepared by me',
      title: 'Sales data scope',
      unrestricted: 'No restriction',
      region: 'My region',
      own: 'Parent project owned by me',
      public: 'Non-confidential projects',
    },
  },
  title: 'Sales permissions example',
  overview: 'Guide',
  actions: 'Actions',
  testAccounts: 'Example accounts',
  account: 'Account',
  permissionSet: 'Permission set',
  password: 'Example password: AuthzExample123!',
  tryTitle: 'Configure and verify',
  roles: {
    assistant: 'Sales assistant',
    engineer: 'Sales engineer',
    manager: 'Project manager',
    delivery: 'Delivery specialist',
  },
  forbidden: 'You do not have permission for this operation.',
  error: 'Failed to load. Please try again.',
};
