import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  'auth.welcome': 'Welcome back',
  'auth.loginDescription': 'Sign in with your username or email and password.',
  'auth.registerTitle': 'Create an account',
  'auth.registerDescription': 'Create an account to get started.',
  'auth.forgotTitle': 'Forgot password',
  'auth.forgotDescription':
    'Enter your email and we will send a reset link if the account exists.',
  'auth.resetTitle': 'Reset password',
  'auth.resetDescription': 'Choose a new password for your account.',
  'auth.identifier': 'Username or email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.signInLink': 'sign in',
  'auth.signingIn': 'Signing in…',
  'auth.hidePassword': 'Hide password',
  'auth.showPassword': 'Show password',
  'auth.forgotLink': 'Forgot password?',
  'auth.signUp': 'Sign up',
  'auth.createAccount': 'Create account',
  'auth.creatingAccount': 'Creating account…',
  'auth.name': 'Name',
  'auth.username': 'Username',
  'auth.email': 'Email',
  'auth.confirmPassword': 'Confirm password',
  'auth.existingAccount': 'Already have an account?',
  'auth.resetting': 'Resetting…',
  'auth.newPassword': 'New password',
  'auth.confirmNewPassword': 'Confirm new password',
  'auth.invalidResetLink':
    'This password reset link is invalid or has expired.',
  'auth.returnTo': 'Return to',
  'auth.sendResetLink': 'Send reset link',
  'auth.sending': 'Sending…',
  'auth.resetSent': 'If the account exists, a reset link has been sent.',
  'auth.rememberPassword': 'Remember your password?',
  'auth.methods': 'Authentication methods',
  'auth.continueWith': 'Or continue with',
  'auth.about': 'About this application',
  'auth.marketingDescription':
    'Give AI a flexible frontend framework to shape each experience, while NocoBase secures the data, permissions, workflows and governance underneath.',
  'auth.platform': 'AI-native application platform',
  'auth.frontendDescription':
    'Compose interfaces freely on a flexible framework.',
  'auth.frontend': 'AI-native frontend',
  'auth.foundationDescription':
    'Reliable data, access control, workflows and governance.',
  'auth.foundation': 'NocoBase foundation',
  'auth.marketingFooter': 'Freedom above. Confidence below.',
  'auth.marketingTitleFirst': 'Let AI build freely.',
  'auth.marketingTitleSecond': 'NocoBase keeps it',
  'auth.marketingTitleThird': 'reliable.',
  'status.loading': 'Loading',
  'status.loadingPage': 'Loading page',
  'status.loadingSettings': 'Loading settings',
  'status.loadingDev': 'Loading dev tools',
  'status.denied': 'Access denied',
  'status.pageFailed': 'Unable to load page',
  'status.retry': 'Retry',
  'navigation.brandHome': 'NocoBase home',
  'navigation.brandApps': 'NocoBase applications',
  'auth.passwordMismatch': "Passwords don't match.",
  'status.deniedDescription': 'You do not have permission to access {{label}}.',
  'status.routeFailedDescription':
    'Route {{label}} from {{packageName}} could not be loaded.',
  shell: {
    workspace: 'AI application workspace',
    buildFreely: 'AI builds freely.',
    reliability: '<brand>NocoBase</brand> keeps it reliable.',
  },
  surface: {
    backToApp: 'Back to app',
    loading: 'Loading {{title}}',
    navigation: '{{title}} navigation',
    page: '{{title}} page',
  },
  settings: {
    title: 'Settings',
    emptyTitle: 'No settings available',
    emptyDescription:
      'No enabled plugin contributes a settings page you have access to.',
  },
  dev: {
    componentExamples: 'Component examples',
    title: 'Dev tools',
    emptyTitle: 'No dev tools available',
    emptyDescription:
      'No enabled plugin contributes a dev page you have access to.',
  },
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Spacious', compact: 'Compact' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    language: 'Language',
  },
  notices: {
    serverLocaleFallback:
      'The server does not support this language, so server messages will use English.',
    languageChangeFailed:
      'Unable to complete the language change. Please try again.',
  },
  account: {
    signOutFailed: 'Unable to sign out. Please try again.',
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    label: 'Application navigation',
    breadcrumb: 'Breadcrumb',
  },
  dataTable: {
    noResults: 'No results.',
    sortAscending: 'Asc',
    sortDescending: 'Desc',
    hideColumn: 'Hide',
    view: 'View',
    toggleColumns: 'Toggle columns',
    selectedCount: '{{selected}} of {{total}} row(s) selected.',
    rowsPerPage: 'Rows per page',
    pageOf: 'Page {{page}} of {{pageCount}}',
    firstPage: 'Go to first page',
    previousPage: 'Go to previous page',
    nextPage: 'Go to next page',
    lastPage: 'Go to last page',
  },
  datePicker: {
    placeholder: 'Pick a date',
    rangePlaceholder: 'Pick a date range',
  },
  reference: {
    docs: 'shadcn docs',
    source: 'Source',
    preview: 'Preview',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    close: 'Close',
    submit: 'Submit',
    reset: 'Reset',
    apply: 'Apply',
    search: 'Search…',
    filter: 'Filter',
    export: 'Export',
    refresh: 'Refresh',
    viewAll: 'View all',
    loading: 'Loading…',
    open: 'Open',
    copy: 'Copy',
    copied: 'Copied',
    more: 'More',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    share: 'Share',
    download: 'Download',
    upload: 'Upload',
    add: 'Add',
    remove: 'Remove',
    settings: 'Settings',
    profile: 'Profile',
    signOut: 'Sign out',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    status: 'Status',
    amount: 'Amount',
    total: 'Total',
    date: 'Date',
    time: 'Time',
    title: 'Title',
    description: 'Description',
    notes: 'Notes',
    actions: 'Actions',
    role: 'Role',
    owner: 'Owner',
    customer: 'Customer',
    product: 'Product',
    quantity: 'Quantity',
    price: 'Price',
    category: 'Category',
    tags: 'Tags',
    priority: 'Priority',
    progress: 'Progress',
    createdAt: 'Created',
    updatedAt: 'Updated',
    dueDate: 'Due date',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    statusPending: 'Pending',
    statusProcessing: 'Processing',
    statusPaid: 'Paid',
    statusFailed: 'Failed',
    statusDraft: 'Draft',
    statusPublished: 'Published',
    statusArchived: 'Archived',
    statusCompleted: 'Completed',
    statusCancelled: 'Cancelled',
    statusShipped: 'Shipped',
    statusRefunded: 'Refunded',
    priorityLow: 'Low',
    priorityMedium: 'Medium',
    priorityHigh: 'High',
    priorityUrgent: 'Urgent',
    yes: 'Yes',
    no: 'No',
    all: 'All',
    none: 'None',
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This week',
    thisMonth: 'This month',
    lastMonth: 'Last month',
    thisYear: 'This year',
    emptyTitle: 'Nothing here yet',
    emptyDescription: 'Create your first record to get started.',
    selectPlaceholder: 'Select…',
    optional: 'Optional',
    required: 'Required',
  },
  examples: {
    title: 'Examples',
    orders: {
      title: 'Orders',
      description:
        'The order list of a small business: summary cards, a status filter, a table with row actions and a detail sheet, all on mock data.',
      stats: {
        orders: 'Orders',
        revenue: 'Revenue',
        averageOrder: 'Average order',
        awaitingAction: 'Awaiting action',
        versusLastMonth: 'vs last month',
        needsFulfilment: 'Needs fulfilment',
      },
      columns: {
        number: 'Order',
        customer: 'Customer',
        status: 'Status',
        channel: 'Channel',
        items: 'Items',
        total: 'Total',
        placedAt: 'Placed',
      },
      status: {
        pending: 'Pending',
        processing: 'Processing',
        shipped: 'Shipped',
        completed: 'Completed',
        cancelled: 'Cancelled',
        refunded: 'Refunded',
      },
      channel: {
        web: 'Web',
        store: 'Store',
        phone: 'Phone',
      },
      searchCustomer: 'Search by customer',
      anyDate: 'Any date',
      empty: 'No orders match these filters.',
      selectAll: 'Select every row',
      selectRow: 'Select this row',
      viewDetails: 'View details',
      copyNumber: 'Copy number',
      cancelOrder: 'Cancel order',
      cancelTitle: 'Cancel this order?',
      cancelDescription:
        'Order {{number}} is marked as cancelled, the customer is notified, and the order cannot be reopened.',
      newOrder: 'New order',
      newOrderDescription:
        'Record an order taken outside the shop, such as one placed by phone.',
      manualLine: 'Order entered by hand',
      cancelled: 'Order cancelled',
      created: 'Order created',
    },
  },
  components: {
    title: 'Components',
    button: {
      title: 'Button',
      description:
        'Triggers an action. Pick the variant by how much attention the action deserves, and keep one primary button per view.',
      variants: 'Variants',
      variantsDescription:
        'Default for the main action, secondary and outline for supporting actions, ghost for toolbars, destructive for irreversible actions, link for inline navigation.',
      sizes: 'Sizes',
      sizesDescription:
        'Match the surrounding controls: sm inside tables and toolbars, default in forms and dialogs, lg for marketing-style calls to action.',
      extraSmall: 'Extra small',
      small: 'Small',
      default: 'Default',
      large: 'Large',
      withIcon: 'With icon',
      withIconDescription:
        'Mark the icon with data-icon so the padding on that side tightens.',
      sendEmail: 'Send email',
      iconOnly: 'Icon only',
      iconOnlyDescription:
        'Icon buttons need an aria-label; there is no visible text to name them.',
      states: 'States',
      statesDescription:
        'Disable while a request is in flight and show a spinner in place of the leading icon.',
      asLink: 'As a link',
      asLinkDescription:
        'Pass an anchor or router Link through render to keep button styling on a real link.',
    },
    accordion: {
      title: 'Accordion',
      description:
        'Stacks collapsible panels so a long page stays scannable. Use it for FAQs, settings groups and order summaries.',
      basic: 'Basic',
      basicDescription:
        'One panel opens at a time. Keep the summary short enough to read on one line.',
      faqShippingQuestion: 'How long does shipping take?',
      faqShippingAnswer:
        'Standard delivery arrives in three to five business days. Expedited orders placed before 14:00 ship the same day.',
      faqReturnsQuestion: 'Can I return an item?',
      faqReturnsAnswer:
        'Yes. Items in their original condition can be returned within 30 days of delivery, and the return label is on us.',
      faqSupportQuestion: 'How do I reach support?',
      faqSupportAnswer:
        'Write to support@northwind.io or open a conversation from the order page. We answer within one business day.',
      multiple: 'Multiple panels',
      multipleDescription:
        'Set type="multiple" when the reader compares panels rather than reading one at a time.',
      settingsNotifications: 'Notifications',
      settingsNotificationsBody:
        'Send an email when an order is placed, shipped or refunded.',
      settingsPrivacy: 'Privacy',
      settingsPrivacyBody:
        'Keep customer contact details out of exported reports.',
      settingsBilling: 'Billing',
      settingsBillingBody:
        'Charge the card on file on the first day of each month.',
      disabled: 'Disabled',
      disabledDescription:
        'Disable a panel while its content is unavailable, and say why in the summary.',
      historyQuestion: 'Who changed this record?',
      historyAnswer:
        'Every edit records the user, the time, and the fields that changed.',
      premiumQuestion: 'Is there a premium plan?',
      premiumAnswer:
        'Premium adds SSO, audit exports and a 99.9% uptime commitment.',
      emailQuestion: 'Which address sends notifications?',
      emailAnswer:
        'Notifications come from notifications@northwind.io unless you change the sender.',
      bordered: 'Bordered',
      borderedDescription:
        'A border separates stacked panels when the surrounding page has no card of its own.',
      billingQuestion: 'When am I charged?',
      billingAnswer:
        'Invoices are issued on the first business day of the month and charged within 48 hours.',
      securityQuestion: 'How is my data protected?',
      securityAnswer:
        'Data is encrypted in transit and at rest, and access is scoped by role.',
      integrationsQuestion: 'Which tools can I connect?',
      integrationsAnswer:
        'Slack, GitHub, and any service that accepts a webhook.',
      controlled: 'Controlled',
      controlledDescription:
        'Drive the open panels from state when the page expands one in response to something else.',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      orderItems: 'Items',
      orderShipping: 'Shipping',
      orderPayment: 'Payment',
    },
    alert: {
      title: 'Alert',
      description:
        'States something the reader has to notice: a result, a warning, or why an action is unavailable.',
      basic: 'Basic',
      basicDescription:
        'A title and a sentence of detail. Reach for a toast when the message does not need to persist.',
      paymentReceivedTitle: 'Payment received',
      paymentReceivedDescription:
        'We received {{amount}} for invoice {{invoice}}.',
      maintenanceTitle: 'Scheduled maintenance',
      maintenanceDescription:
        'Orders are still accepted; reporting stays read-only until 04:00 UTC on Sunday.',
      destructive: 'Destructive',
      destructiveDescription:
        'Use the destructive variant for failures and irreversible state, never for information.',
      paymentFailedTitle: 'Payment failed',
      paymentFailedDescription:
        'The card ending in 4242 was declined. Ask the customer for another method.',
      syncStoppedTitle: 'Sync stopped',
      syncStoppedDescription:
        'The connector stopped after three failed attempts:',
      syncStoppedReasonToken: 'The access token expired.',
      syncStoppedReasonPermissions:
        'The integration lost write access to Customers.',
      withoutIcon: 'Without an icon',
      withoutIconDescription:
        'Text-only alerts suit dense pages; keep the variant so the message still reads as a notice.',
      titleOnly: 'Storage almost full',
      descriptionOnly:
        'A description without a title works when one sentence is the whole message.',
      withAction: 'With an action',
      withActionDescription:
        'Put the recovery step in the alert rather than behind a menu.',
      storageTitle: 'Storage {{percent}} full',
      storageDescription: 'New uploads are paused for this workspace.',
      manageStorage: 'Manage storage',
      exportReadyTitle: 'Export ready',
      exportReadyDescription: 'The file {{file}} is ready to download.',
      webhookFailedTitle: 'Webhook failed',
      webhookFailedDescription:
        'Delivery to the orders endpoint returned 502 four times in a row.',
      retry: 'Retry',
      inForm: 'Inside a form',
      inFormDescription:
        'Placed above the fields it explains, an alert reads as part of the form rather than as a page notice.',
      formTitle: 'Connect a payment account',
      formDescription:
        'Orders cannot be charged until an account is connected.',
      formErrorTitle: 'Check the highlighted fields',
      formErrorDescription:
        'Two fields need a value before this product can be published.',
    },
    alertDialog: {
      title: 'Alert dialog',
      description:
        'Interrupts the flow for a decision that cannot be undone. Reserve it for a confirmation the reader has to answer before anything continues.',
      basic: 'Basic',
      basicDescription:
        'The cancel action comes first, so Escape and the initial focus both land on the safe choice.',
      archiveProject: 'Archive project',
      archiveTitle: 'Archive "Website redesign"?',
      archiveDescription:
        'The project and its history move to the archive. You can restore it from Settings within 30 days.',
      archive: 'Archive',
      small: 'Small',
      smallDescription:
        'A one-line consequence needs no media; keep the dialog to the width of its sentence.',
      sendInvoice: 'Send invoice',
      sendTitle: 'Send invoice {{invoice}}?',
      sendDescription: 'The customer at {{email}} receives it immediately.',
      notNow: 'Not now',
      send: 'Send',
      withMedia: 'With media',
      withMediaDescription:
        'A thumbnail of the item being deleted makes the consequence unmistakable.',
      shareTitle: 'Share with the finance team?',
      shareDescription:
        'Everyone in {{team}} gains edit access to this report.',
      destructive: 'Destructive',
      destructiveDescription:
        'Phrase the title as the action, name the records it touches, and keep the confirm button red.',
      deleteCustomer: 'Delete customer',
      deleteTitle: 'Delete {{customer}}?',
      deleteDescription:
        'This also removes {{count}} related records, and deleting cannot be undone.',
      deleting: 'Deleting…',
      withoutTrigger: 'Controlled',
      withoutTriggerDescription:
        'Open the dialog from state when the trigger is not the thing the reader clicked.',
      leavePage: 'Leave page',
      discardTitle: 'Discard unsaved changes?',
      discardDescription: 'Your edits to this product have not been saved.',
      keepEditing: 'Keep editing',
      discard: 'Discard',
    },
    aspectRatio: {
      title: 'Aspect ratio',
      description:
        'Reserves space for media at a fixed ratio, so a slow image never shifts the layout under the reader.',
      video: 'Video',
      videoDescription:
        '16:9 matches the recording and keeps the player flush with the text column.',
      videoAlt: 'Video poster: product walkthrough',
      play: 'Play the walkthrough',
      square: 'Square',
      squareDescription:
        '1:1 suits marketplace tiles and profile grids, where every item is the same size.',
      portrait: 'Portrait',
      portraitDescription:
        '4:5 leaves room for a caption and reads better than a square in a narrow column.',
      portraitAlt: 'Portrait of a model wearing the jacket',
      placeholder: 'Placeholder',
      placeholderDescription:
        'Give the slot its ratio before the asset exists, so the page does not jump when it arrives.',
      mapPlaceholder: 'Map preview unavailable offline',
      inCard: 'Inside a card',
      inCardDescription:
        'The ratio governs the media area in the card; the text below keeps its own spacing.',
      cardAlt: 'Team meeting in the Lisbon office',
      recorded: 'Recorded Sep 4',
      cardTitle: 'Design review',
      cardDescription: '{{date}} · {{duration}}',
    },
    attachment: {
      removeFile: 'Remove {{file}}',
      title: 'Attachment',
      description:
        'Represents an uploaded file in a list, a conversation or a composer, including its size and its progress.',
      basic: 'Basic',
      basicDescription:
        'Name, type and size in one row, with the actions on the trailing edge.',
      states: 'States',
      statesDescription:
        'One component covers the whole life of an upload: waiting, in flight, processing, failed and done.',
      readyToUpload: 'Ready to upload',
      uploadingProgress: 'Uploading {{percent}}',
      cancelUpload: 'Cancel upload',
      processingDocument: 'Processing document…',
      uploadFailed: 'Upload failed',
      retryUpload: 'Retry upload',
      uploadedMeta: 'PDF · {{size}}',
      sizes: 'Sizes',
      sizesDescription:
        'Size the row to the surface: compact in tables, default in lists and cards.',
      images: 'Images',
      imagesDescription:
        'Image attachments show a thumbnail and open in a preview dialog.',
      openFile: 'Open {{file}}',
      conversation: 'In a conversation',
      conversationDescription:
        'Inside a message, an attachment sits with the text it belongs to rather than in a separate list.',
      conversationCustomer: 'Could you send the signed agreement?',
      conversationReply:
        'Attached — the countersigned copy is on the last page.',
      composer: 'In a composer',
      composerDescription:
        'A composer holds drafts until the message is sent, so an upload can still be cancelled.',
      composerPlaceholder: 'Write a reply…',
      composerLabel: 'Message',
      attachFile: 'Attach a file',
      send: 'Send',
    },
    avatar: {
      title: 'Avatar',
      description:
        'Stands in for a person: a photo when there is one, initials when there is not.',
      basic: 'Basic',
      basicDescription:
        'Always pass a fallback: images fail to load, and a broken image is worse than initials.',
      unknownUser: 'Unassigned',
      sizes: 'Sizes',
      sizesDescription:
        'Match the row: xs in dense tables, sm beside a name, lg on a profile page.',
      badge: 'With a status badge',
      badgeDescription:
        'The badge carries presence at the corner; name it for screen readers instead of relying on colour.',
      online: 'Online',
      away: 'Away',
      busy: 'Busy',
      group: 'Group',
      groupDescription:
        'Overlapping avatars summarise a set of people; the count keeps the remainder honest.',
      inList: 'In a list',
      inListDescription:
        'An avatar beside the name makes a table of people scannable at a glance.',
      roleEditor: 'Editor',
      roleViewer: 'Viewer',
    },
    badge: {
      title: 'Badge',
      description:
        'Labels a record with a short status, count or category. Read the value from the surrounding text rather than from the badge alone.',
      variants: 'Variants',
      variantsDescription:
        'Default draws attention, secondary and outline stay quiet, destructive marks a failure, link reads as navigation.',
      default: 'New',
      secondary: 'Draft',
      destructive: 'Overdue',
      outline: 'Wholesale',
      ghost: 'Archived',
      link: 'View details',
      withIcon: 'With an icon',
      withIconDescription:
        'An icon carries meaning that the colour alone cannot.',
      verified: 'Verified',
      bookmarked: 'Saved',
      withSpinner: 'With a spinner',
      withSpinnerDescription:
        'Show the work in progress inside the badge instead of replacing it with an empty space.',
      generating: 'Generating…',
      deleting: 'Deleting…',
      asLink: 'As a link',
      asLinkDescription:
        'A badge that navigates is a link: keep the badge styling and let the anchor carry the behaviour.',
      buttonPage: 'Open the button page',
      statusMapping: 'Status mapping',
      statusMappingDescription:
        'One status field, one variant per value: map the value once instead of styling each badge by hand.',
      counts: 'Counts',
      countsDescription:
        'A count badge belongs at the end of the label it counts, and stays readable as the number grows.',
      mailboxes: 'Mailboxes',
      inbox: 'Inbox',
    },
    breadcrumb: {
      title: 'Breadcrumb',
      description:
        'Shows where the current page sits in the hierarchy and offers a way back up to each level.',
      basic: 'Basic',
      basicDescription:
        'The trail repeats what the navigation already says; keep the last item plain text rather than a link.',
      dashboard: 'Dashboard',
      customers: 'Customers',
      orders: 'Orders',
      customSeparator: 'Custom separator',
      customSeparatorDescription:
        'Any node works as a separator; a chevron is the default because it reads as direction rather than text.',
      dropdown: 'With a dropdown',
      dropdownDescription:
        'A level that holds several siblings opens as a menu instead of naming one destination.',
      collapsed: 'Collapsed',
      collapsedDescription:
        'Long trails keep the first step and the last two, and hide the middle behind an ellipsis.',
      showHidden: 'Show hidden items',
      responsive: 'Responsive',
      responsiveDescription:
        'The trail truncates on narrow screens so the page title keeps its space.',
    },
    bubble: {
      title: 'Bubble',
      description:
        'Holds one message in a conversation, with the variants and reactions a support thread needs.',
      conversation: 'Conversation',
      conversationDescription:
        'Direction expresses the speaker, and the time sits under each group.',
      customerAsks: 'Where is my order {{order}}?',
      agentChecking: 'Checking with the courier now — one moment.',
      agentShipped: 'It shipped this morning. Tracking number {{tracking}}.',
      reactionThumbsUp: 'Helpful',
      customerThanks: 'Perfect, thank you!',
      variants: 'Variants',
      variantsDescription:
        'Use one variant per side of the conversation so the direction stays readable without avatars.',
      variantDefault: 'One moment, please.',
      variantSecondary: 'Your invoice is attached.',
      variantMuted: 'This conversation is recorded.',
      variantTinted: 'Priority support is active.',
      variantOutline: 'Draft message — not sent yet.',
      variantDestructive: 'The delivery address could not be verified.',
      variantGhost: 'No message was sent.',
      reactions: 'Reactions',
      reactionsDescription:
        'Reactions sit under the bubble they answer, and screen readers hear the count instead of the emoji.',
      reactionsMessage: 'I moved the delivery to Friday.',
      reactionsSummary: '2 reactions: a thumbs up and a heart',
      reactionsTopMessage: 'This one has the most reactions.',
      reactionsReadMessage: 'Read receipts are reactions too.',
      readReceipt: 'Read',
      readAt: 'Read {{time}}',
      quickReplies: 'Quick replies',
      quickRepliesDescription:
        'Suggested answers save typing on mobile and keep the reply on topic.',
      howCanIHelp: 'How can I help today?',
      richContent: 'Rich content',
      richContentDescription:
        'A bubble can hold more than a sentence: lists, links and emphasis keep the message shape.',
      richQuestion: 'How do I connect a store?',
      richIntro: 'Connecting a store takes three steps:',
      richStepOne: 'Open Settings',
      richStepTwo: 'Choose the store platform',
      richStepThree: 'Paste the API key and save',
      sendFailed: 'Message not sent',
      retrySend: 'Resend message',
      replyInvoice: 'Where is my invoice?',
      replyShipping: 'When will my order ship?',
      replyAgent: 'Talk to a person',
      answerInvoice:
        'Invoice INV-2031 went to billing@acme.com this morning, and a copy is in your account.',
      answerShipping:
        'Your order left the warehouse today and arrives within two business days.',
      answerAgent:
        'Connecting you to a support agent. The current wait is about two minutes.',
    },
    buttonGroup: {
      title: 'Button group',
      description:
        'Joins related buttons into one control, with a single border between neighbours instead of a doubled one.',
      basic: 'Basic',
      basicDescription:
        'Group the actions that act on the same object, and keep the primary action leftmost.',
      reviewActions: 'Review actions',
      approve: 'Approve',
      reject: 'Reject',
      reassign: 'Reassign',
      sizes: 'Sizes',
      sizesDescription:
        'Every button in a group shares one size; the group sets it instead of each button setting its own.',
      orientation: 'Vertical',
      orientationDescription:
        'Stack the group vertically when the labels are too long to sit side by side.',
      zoomControls: 'Zoom controls',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      split: 'Split button',
      splitDescription:
        'A primary action with a menu of less common ones, attached so they read as one button.',
      moreSaveOptions: 'More save options',
      saveAsDraft: 'Save as draft',
      saveAndClose: 'Save and close',
      discardChanges: 'Discard changes',
      paste: 'Paste',
      withInput: 'With an input',
      withInputDescription:
        'Attach an input to the buttons it drives so the control reads as one unit.',
      decrease: 'Decrease quantity',
      increase: 'Increase quantity',
      nested: 'Nested',
      nestedDescription:
        'Groups can nest: an outer group holds the toolbar together while an inner one splits a related pair.',
      ticketToolbar: 'Ticket toolbar',
      markAsRead: 'Mark as read',
      snooze: 'Snooze',
    },
    calendar: {
      noDate: 'No date',
      title: 'Calendar',
      description:
        'Picks a single day or a range, and follows the interface language for weekday and month names.',
      single: 'Single date',
      singleDescription:
        'A date field needs the selected value in words beside it, so the reader can confirm it.',
      selected: 'Selected:',
      range: 'Date range',
      rangeDescription:
        'A range shows two months side by side, so the start and the end are both visible.',
      reportingPeriod: 'Reporting period:',
      dropdown: 'Month and year',
      dropdownDescription:
        'A date far from today, such as a birth date, needs the year first rather than a month-by-month walk.',
      dateOfBirth: 'Date of birth:',
      presets: 'Presets',
      presetsDescription:
        'A preset writes the range a reader actually wants in one click.',
      disabledDates: 'Disabled dates',
      disabledDatesDescription:
        'Disable the days that cannot be chosen and explain why underneath, rather than failing after the fact.',
      deliveryDate: 'Delivery date:',
      disabledDatesHint: 'Weekends and public holidays are unavailable.',
      tomorrow: 'Tomorrow',
      inThreeDays: 'In three days',
      inAWeek: 'In a week',
      inTwoWeeks: 'In two weeks',
    },
    card: {
      title: 'Card',
      description:
        'Groups one subject with its actions. Reach for it when a page carries more than one block of content.',
      basic: 'Basic',
      basicDescription:
        'Title, description, content and footer are separate parts, and a card does not have to use all of them.',
      inviteTitle: 'Invite teammates',
      inviteDescription: 'They join this workspace with the role you choose.',
      viewMembers: 'View members',
      inviteEmailHint: 'Separate several addresses with a comma.',
      sendInvite: 'Send invite',
      small: 'Small',
      smallDescription:
        'A compact card fits beside others in a grid; keep one idea per card.',
      featureTitle: 'Scheduled reports',
      featureDescription: 'Send a summary to your inbox every Monday morning.',
      featureBulletSchedule: 'Weekly or monthly',
      featureBulletRecipients: 'Any number of recipients',
      featureBulletContent: 'Orders, revenue and returns',
      setUpReports: 'Set up reports',
      learnMore: 'Learn more',
      withImage: 'With media',
      withImageDescription:
        'Media sits at the top of the card and takes its ratio from the container.',
      productDescription: 'Merino wool, knitted in Portugal.',
      newArrival: 'New arrival',
      addToCart: 'Add to cart',
      stats: 'Stats',
      statsDescription:
        'A number that matters reads better as the card heading than inside a sentence.',
      vsLastMonth: 'vs last month',
      edgeToEdge: 'Edge to edge',
      edgeToEdgeDescription:
        'Bleed the content past the card padding so a table or a chart reaches the border.',
      activityTitle: 'Recent activity',
      activityDescription:
        'Keep the list to the last few events and link out for the rest.',
      statRevenue: 'Revenue',
      statOrders: 'Orders',
      statCustomers: 'Customers',
      activityPaid: '{{customer}} paid invoice {{invoice}}',
      activityShipped: 'Order {{order}} shipped',
      activityJoined: '{{name}} joined the workspace',
    },
    carousel: {
      title: 'Carousel',
      description:
        'Steps through a small set of slides in place. Use it for onboarding and media galleries, not for content the reader has to reach.',
      basic: 'Basic',
      basicDescription:
        'One slide at a time, with the arrows and the keyboard reaching the same controls.',
      multiple: 'Multiple slides',
      multipleDescription:
        'Show several slides at once when each one is small, and let the last one snap to the edge.',
      vertical: 'Vertical',
      verticalDescription:
        'A vertical carousel suits a short list of steps in a narrow column.',
      api: 'Controlled',
      apiDescription:
        'The carousel api reports the current step and scrolls to any other, which is what a step counter needs.',
      stepOf: 'Step {{current}} of {{total}}',
      goToStep: 'Go to step {{step}}',
      announcementMaintenance: 'Scheduled maintenance on Sunday',
      announcementExports: 'CSV exports now include custom fields',
      announcementRoles: 'Role permissions were updated',
      announcementApi: 'API v2 is open for testing',
      stepWorkspace: 'Create your workspace',
      stepWorkspaceBody:
        'Name the workspace and choose the region its data is stored in.',
      stepInvite: 'Invite your team',
      stepInviteBody:
        'Add colleagues by email and give each one the role they need.',
      stepImport: 'Import your data',
      stepImportBody: 'Bring orders and customers in from a CSV file.',
      stepDone: 'Review and go live',
      stepDoneBody:
        'Check the settings once more, then publish the workspace to your team.',
    },
    chart: {
      online: 'Online',
      retail: 'Retail',
      planFree: 'Free',
      planPro: 'Pro',
      orders: 'Orders',
      returns: 'Returns',
      revenue: 'Revenue',
      hardware: 'Hardware',
      software: 'Software',
      services: 'Services',
      support: 'Support',
      training: 'Training',
      quotaAttainment: 'Quota attainment',
      title: 'Chart',
      description:
        'Draws a series with the shared chart tokens, so colours follow the theme and the legend stays consistent.',
      bar: 'Bar',
      barDescription:
        'Compare a few categories by length; keep the bars in one colour and label the axis.',
      area: 'Area',
      areaDescription:
        'An area chart shows a total and how it changes; stack the series when they add up to something.',
      signupsTitle: 'Signups',
      signupsDescription: 'Free and Pro accounts created each month.',
      trendingUp: 'Up {{percent}} this month',
      line: 'Line',
      lineDescription:
        'A line suits several series measured the same way, where the trend matters more than the totals.',
      pie: 'Pie',
      pieDescription:
        'A pie answers one question: how a whole divides. Keep it to a handful of slices.',
      revenueTotal: 'Revenue this quarter',
      radial: 'Radial',
      radialDescription:
        'A radial gauge reports progress toward one goal, and reads best beside the number it represents.',
    },
    checkbox: {
      title: 'Checkbox',
      description:
        'Picks any number of options from a set, including none. Use a switch for a single setting that is either on or off.',
      basic: 'Basic',
      basicDescription:
        'Label every box with what checking it does, and put the detail underneath the label rather than inside it.',
      acceptTerms: 'Accept the terms of service',
      newsletter: 'Send me the newsletter',
      newsletterDescription:
        'One email a month with product news. Unsubscribe at any time.',
      disabledOption: 'Unavailable on this plan',
      invalidOption: 'Choose at least one delivery option',
      controlled: 'Controlled',
      controlledDescription:
        'Keep the value in state when something else on the page has to react to it.',
      sendCopy: 'Send a copy to billing',
      sendCopyOn: 'A copy goes to {{email}}',
      sendCopyOff: 'No copy is sent',
      group: 'A group of options',
      groupDescription:
        'A fieldset with a legend names the group, and each box then needs only its own label.',
      notifyMe: 'Notify me about',
      notifyMeDescription: 'Choose what reaches your inbox.',
      notifyOrders: 'New orders',
      notifyPayments: 'Payments',
      notifyMentions: 'Mentions',
      notifyDigest: 'Weekly digest',
      indeterminate: 'Indeterminate',
      indeterminateDescription:
        'A parent box shows a dash while only some of its children are checked, and clearing it clears all of them.',
      allPermissions: 'All {{resource}} permissions',
      permissionRead: 'Read',
      cards: 'As cards',
      cardsDescription:
        'When each option needs a description and a price, wrap the whole card in a label so the target is the card.',
      addOnSupport: 'Priority support',
      addOnSupportDescription:
        'First response within four hours, seven days a week.',
      addOnStorage: 'Extra storage',
      addOnStorageDescription: 'Adds 500 GB to the plan.',
      addOnSso: 'Single sign-on',
      addOnSsoDescription:
        'SAML and OIDC, with provisioning from your directory.',
      table: 'In a table',
      tableDescription:
        'A select-all box in the header and one per row, with the count of what is selected above.',
      selectedCount: '{{selected}} of {{total}} selected',
      selectAll: 'Select every row',
      selectRow: 'Select {{name}}',
      roleEditor: 'Editor',
      roleViewer: 'Viewer',
    },
    collapsible: {
      title: 'Collapsible',
      description:
        'Hides one block of detail until it is asked for. Use it inside a page the reader has already chosen; a route is for content they navigate to.',
      basic: 'Basic',
      basicDescription:
        'The trigger and the panel are one control: keep them in one component so the panel opens from the row it belongs to.',
      toggleDetails: 'Toggle order details',
      shippingAddress: 'Shipping address',
      items: 'Items',
      inCard: 'In a card',
      inCardDescription:
        'A collapsible trigger in a card header keeps the detail attached to the summary it explains.',
      productDetails: 'Product details',
      productDetailsBody:
        'Studio headphones with active noise cancelling, 40 hours of playback and a replaceable battery.',
      viewSpecs: 'View full specifications',
      showMore: 'Long text',
      showMoreDescription:
        'A paragraph can be revealed in place; only hide the text the reader is likely to want in full.',
      longTextIntro:
        'The noise cancelling adapts to the shape of your head each time you put the headphones on.',
      longTextMiddle:
        'Two microphones per cup separate your voice from the room, which is what keeps a call audible on a train platform.',
      longTextEnd:
        'The battery is replaceable, so a pair that is four years old is not a pair to throw away.',
      showLess: 'Show less',
      showMoreAction: 'Show more',
      advanced: 'Advanced settings',
      advancedDescription:
        'Only the field the reader has to fill stays visible; the rest waits behind one trigger.',
      webhookTitle: 'Webhook',
      webhookDescription: 'Send order events to your own endpoint.',
      endpointUrl: 'Endpoint URL',
      signingSecret: 'Signing secret',
      maxRetries: 'Max retries',
      advancedOptions: 'Advanced options',
      tree: 'A tree',
      treeDescription:
        'A nested list uses one collapsible per branch, with the chevron rotating and the level shown by indentation.',
    },
    combobox: {
      title: 'Combobox',
      description:
        'A select with a search field. Use it when the list is long enough that typing is faster than scanning.',
      basic: 'Basic',
      basicDescription:
        'Put the list in the popup and describe the current value in the field description underneath.',
      assignee: 'Assignee',
      assigneePlaceholder: 'Search people',
      empty: 'No matches.',
      assignedTo: 'Assigned to {{name}}',
      unassigned: 'Nobody is assigned yet',
      objectItems: 'Object values',
      objectItemsDescription:
        'The selection can be a record rather than a string: give the combobox a value per item and render the object in the list.',
      customerPlaceholder: 'Search customers',
      shipsTo: 'Ships to {{city}}',
      noCustomer: 'Choose a customer to see the delivery address',
      groups: 'Grouped options',
      groupsDescription:
        'Group a long list by the heading the reader is looking for, and search across every group at once.',
      productPlaceholder: 'Search products',
      multiple: 'Multiple values',
      multipleDescription:
        'Chips keep the chosen values visible while the field stays open for the next one.',
      addTag: 'Add a tag',
      tagCount: '{{count}} tags',
      popup: 'As a button',
      popupDescription:
        'A trigger button opens the same list, which is what a toolbar or a filter control needs.',
      ownerPlaceholder: 'Assign an owner',
      states: 'States',
      statesDescription:
        'Show a disabled field as one holding a value it did not choose, and an invalid one with the reason underneath.',
      disabled: 'Disabled',
      invalid: 'Invalid',
      requiredError: 'Choose an assignee to continue',
    },
    command: {
      title: 'Command',
      description:
        'A searchable list of actions. Use it for a launcher, or for a picker where the reader already knows the name of what they want.',
      basic: 'Basic',
      basicDescription:
        'Group the list by what the actions do, and let typing filter every group at once.',
      placeholder: 'Type a command or search…',
      empty: 'No commands found.',
      navigation: 'Go to',
      orders: 'Orders',
      customers: 'Customers',
      invoices: 'Invoices',
      newOrder: 'New order',
      importCsv: 'Import CSV',
      exportReport: 'Export report',
      dialog: 'In a dialog',
      dialogDescription:
        'Wrap the same list in a dialog and bind it to a keyboard shortcut, which is what a command palette is.',
      openPalette: 'Open palette',
      lastRun: 'Ran {{command}}',
      nothingRun: 'Nothing has run yet',
      paletteTitle: 'Command palette',
      paletteDescription: 'Search for a command, an order or a customer.',
      products: 'Products',
      newCustomer: 'New customer',
      billing: 'Billing',
      shortcuts: 'With shortcuts',
      shortcutsDescription:
        'Put the key combination at the end of the row so the reader learns it while using the menu.',
      selection: 'As a picker',
      selectionDescription:
        'A command list also works as a searchable picker: keep the current value above and mark the selected row.',
      assignedTo: 'Assigned to',
      searchMembers: 'Search team members',
      team: 'Team',
    },
    contextMenu: {
      title: 'Context menu',
      description:
        'The actions offered on a record or an area when it is right-clicked. Keep it to what applies to the thing under the pointer.',
      basic: 'Basic',
      basicDescription:
        'A context menu supplements a place, it does not replace it: every action in it is reachable somewhere else too.',
      rightClickHere: 'Right-click here',
      forward: 'Forward',
      saveAs: 'Save as',
      print: 'Print',
      submenu: 'A submenu',
      submenuDescription:
        'Actions that do not fit one level move into a submenu, whose parent keeps a chevron pointing right.',
      message: 'Send message',
      copyLink: 'Copy link',
      moveTo: 'Move to',
      folderProjects: 'Projects',
      folderShared: 'Shared',
      folderArchive: 'Archive',
      options: 'Checks and choices',
      optionsDescription:
        'Checkbox items hold several settings that are on at once; radio items pick one value from a mutually exclusive set.',
      view: 'View',
      showArchived: 'Show archived',
      showCompleted: 'Show completed',
      sortBy: 'Sort by',
      record: 'On a record',
      recordDescription:
        'When a row or a card is right-clicked, every action in the menu applies to that one record.',
      viewDetails: 'View details',
      duplicate: 'Duplicate',
      markShipped: 'Mark as shipped',
      cancelOrder: 'Cancel order',
      lastAction: 'Ran {{action}}',
      noAction: 'Right-click a record to act on it.',
    },
    dataTable: {
      title: 'DataTable',
      description:
        'Sorting, filtering, pagination and column visibility on top of TanStack Table, over the same table primitives.',
      full: 'Full table',
      fullDescription:
        'The toolbar filters by customer and toggles columns, and the footer carries the paging controls.',
      orderNumber: 'Order',
      filterPlaceholder: 'Filter by customer',
      lastAction: 'Ran {{action}}',
      noAction: 'Open a row menu to act on an order.',
      viewDetails: 'View details',
      copyNumber: 'Copy number',
      markShipped: 'Mark as shipped',
      cancelOrder: 'Cancel order',
      selectAll: 'Select every row',
      selectRow: 'Select this row',
      compact: 'Compact',
      compactDescription:
        'Without pagination and with four columns, the same table fits inside a card or a side panel.',
      selectedOrder: 'Selected {{number}} · {{customer}}',
      clickRow: 'Click a row to select it.',
      empty: 'Empty state',
      emptyDescription:
        'Pass the message the table shows when there is nothing to list, and keep the header so the columns stay named.',
      noOrders: 'No orders yet.',
    },
    datePicker: {
      title: 'Date picker',
      description:
        'Picks a date or a date range in a popover calendar. Reach for it when the calendar helps; a plain input is faster for a date the reader already knows.',
      single: 'Single date',
      singleDescription:
        'Keep the formatted value visible beside the field so the reader can check what was chosen.',
      selected: 'Selected {{date}}',
      nothingSelected: 'Nothing selected',
      range: 'Date range',
      rangeDescription:
        'A range picker writes both ends at once, which is what a report period needs.',
      rangeSelected: '{{from}} to {{to}}',
      pickBothEnds: 'Pick a start and an end date',
      field: 'In a form',
      fieldDescription:
        'Pair the picker with a label and a hint, and put the deadline or the expected format in the hint.',
      dueDateHint: 'Payment is due 30 days after the invoice date.',
      reportPeriod: 'Report period',
      reportPeriodPlaceholder: 'Choose a period',
      reportPeriodHint:
        'The period includes both dates and cannot exceed one year.',
      constraints: 'Unavailable dates',
      constraintsDescription:
        'Disable what cannot be chosen rather than validating after the fact, and say why in the hint.',
      deliveryDate: 'Delivery date',
      deliveryHint: 'Deliveries start the day after tomorrow.',
      closedOn: 'Closed on',
      closedHint: 'This date is fixed once the record is closed.',
      dropdown: 'Month and year menus',
      dropdownDescription:
        'A birth date is decades away: switch the caption to dropdowns and bound the range so the reader does not page through years.',
      birthDate: 'Date of birth',
      locale: 'In another language',
      localeDescription:
        'The calendar takes a date-fns locale, so month names, weekday names and the first day of the week follow the language rather than the browser.',
    },
    dialog: {
      title: 'Dialog',
      description:
        'Stops the reader and asks for one thing. Keep it to a single decision; a page is for anything longer.',
      form: 'A form',
      formDescription:
        'A short form fits a dialog: give it a title that names the record and a hint about what saving does.',
      editCustomer: 'Edit customer',
      editCustomerDescription: 'Update the contact details for this customer.',
      emailHint: 'Invoices and delivery updates go to this address.',
      confirm: 'Confirming',
      confirmDescription:
        'Ask before anything that cannot be undone, put the destructive button last, and name the record in the question.',
      deleteInvoice: 'Delete invoice',
      deleteInvoiceTitle: 'Delete invoice {{number}}?',
      deleteInvoiceDescription:
        'The invoice and its payment history are removed. This cannot be undone.',
      deleted: 'Invoice {{number}} deleted',
      undo: 'Undo',
      scrollable: 'Long content',
      scrollableDescription:
        'When the content is taller than the viewport, let the body scroll and keep the header and footer in place.',
      viewOrderItems: 'View order items',
      orderItems: 'Order {{number}}',
      orderItemsDescription: '{{count}} items in this order',
      share: 'Share',
      shareDescription:
        'A dialog is also a good home for a value the reader has to copy, because it stays open while they copy it.',
      shareLink: 'Share link',
      shareLinkDescription: 'Anyone with this link can view the order.',
      sizes: 'Sizes',
      sizesDescription:
        'Set the width with a max-width on the content: sm for a confirmation, lg for a form, and wider only for a table.',
      small: 'Small',
      sizeHint: 'This dialog is {{width}}',
      medium: 'Medium',
      large: 'Large',
    },
    direction: {
      title: 'Direction',
      description:
        'Wrap a subtree in DirectionProvider so Base UI knows which way keyboard navigation and popup alignment run, and set the dir attribute so the layout itself flips. An application sets both once from the active locale.',
      ltr: 'Left to right',
      rtl: 'Right to left',
      current: 'dir="{{direction}}"',
      sideBySide: 'Side by side',
      sideBySideDescription:
        'The same form in both directions. Labels, controls and the primary action move to the other edge without a single conditional.',
      searchPlaceholder: 'Search orders…',
      notifyByEmail: 'Email me about order updates',
      notifyByEmailHint: 'One message per status change, never marketing.',
      twoFactor: 'Two-factor authentication',
      twoFactorHint:
        'Ask for a verification code when signing in from a new device.',
      continue: 'Continue',
      menus: 'Menus and submenus',
      menusDescription:
        'A popup opens toward the reading direction and a submenu flies out the other way; the arrow keys follow.',
      invite: 'Invite member',
      inviteByEmail: 'Invite by email',
      inviteByLink: 'Copy invite link',
      assignRole: 'Assign a role',
      roleViewer: 'Viewer',
      roleEditor: 'Editor',
      roleAdmin: 'Administrator',
      logical: 'Logical properties',
      logicalDescription:
        'Use ms/me, ps/pe and border-s/border-e instead of left and right, so one class works in both directions.',
      logicalHint:
        'text-start, ps-3 and border-s-2 flip with the direction; rtl:rotate-180 turns the chevron.',
    },
    empty: {
      title: 'Empty',
      description:
        'The state a list shows before it holds anything. Say why it is empty and offer the one action that fills it, rather than leaving a blank panel.',
      basic: 'First run',
      basicDescription:
        'Nothing has been created yet, so lead with the action that creates the first record.',
      noOrders: 'No orders yet',
      noOrdersDescription:
        'Orders appear here as soon as your first customer checks out. You can also import a spreadsheet from your previous system.',
      createOrder: 'Create order',
      importOrders: 'Import orders',
      outline: 'No results',
      outlineDescription:
        'A filtered list is empty for a different reason, so offer to widen the search rather than to create something.',
      noResults: 'No matching products',
      noResultsDescription:
        'Nothing matches “{{query}}”. Try a shorter term or clear the filters.',
      clearFilters: 'Clear filters',
      avatar: 'With an avatar',
      avatarDescription:
        'When the empty state is about one person or one record, show it instead of a generic icon.',
      noMembers: 'No teammates yet',
      noMembersDescription:
        '{{name}} is the only member of this workspace. Invite the people you work with to share orders and reports.',
      inviteMember: 'Invite a teammate',
      inputGroup: 'With the action inline',
      inputGroupDescription:
        'When the action needs one value, put the field in the empty state so the user never leaves it.',
      inviteByEmail: 'Invite by email',
      inviteByEmailDescription:
        'Send an invitation and the teammate joins with viewer access until you change it.',
      invitationSent: 'Invitation sent to {{email}}.',
      emailPlaceholder: 'teammate@example.com',
      invite: 'Invite',
      background: 'Filling a panel',
      backgroundDescription:
        'Give the empty state a height and a soft gradient when it stands in for a whole region rather than a few rows.',
      noAttachments: 'No attachments',
      noAttachmentsDescription:
        'Drop a file here, or upload a signed delivery note so it travels with the order.',
      uploadFile: 'Upload a file',
    },
    hoverCard: {
      title: 'Hover Card',
      description:
        'Previews what is behind a link while the pointer rests on it. It enriches, never carries anything essential: a touch user never opens it.',
      basic: 'A person preview',
      basicDescription:
        'The canonical use: a mention that expands into who the person is.',
      roleAccountManager: 'Account manager',
      joined: 'Joined {{date}}',
      delays: 'Open and close delays',
      delaysDescription:
        'A short open delay stops the card firing as the pointer crosses the link; a close delay lets the pointer travel into the card.',
      instant: 'Opens instantly',
      delayed: 'Opens after 700ms',
      sides: 'Sides',
      sidesDescription:
        'The card flips to the opposite side when there is no room; choose the side that keeps the trigger visible.',
      top: 'Top',
      right: 'Right',
      bottom: 'Bottom',
      left: 'Left',
      sideHint: 'side="{{side}}" anchors the card on this edge of the trigger.',
      business: 'Inside a sentence',
      businessDescription:
        'Record references in prose expand without leaving the page, which keeps a summary short and still answerable.',
      sentenceStart: 'The escalation concerns order',
      items: 'Items',
      sentenceMiddle: 'placed by',
      sentenceEnd: ', who is waiting on a replacement shipment.',
    },
    kbd: {
      title: 'Kbd',
      description:
        'Renders a physical key or a chord. Use it wherever you tell someone which keys to press, so keys look the same in menus, tooltips and help text.',
      basic: 'Single keys and chords',
      basicDescription:
        'One Kbd holds one key. Wrap several in KbdGroup for a chord, and add a separator only when the keys are pressed in sequence rather than together.',
      inText: 'In running text',
      inTextDescription:
        'Keep the keys inline with the sentence so the hint reads as a sentence rather than as a legend.',
      hintBefore: 'Press',
      hintAfter:
        'to open the command palette from anywhere in the application.',
      inButton: 'In a button',
      inButtonDescription:
        'Mark the Kbd with data-icon so the button tightens the padding on that side, exactly as it does for a trailing icon.',
      inTooltip: 'In a tooltip',
      inTooltipDescription:
        'An icon button has no visible label, so name the action and its shortcut together in the tooltip.',
      saveChanges: 'Save changes',
      print: 'Print',
      printInvoice: 'Print invoice',
      inInput: 'In an input',
      inInputDescription:
        'A trailing addon showing the shortcut tells the reader the field is reachable without the mouse.',
      searchPlaceholder: 'Search orders, customers, invoices…',
      shortcutList: 'A shortcut list',
      shortcutListDescription:
        'A definition list pairs each action with its keys; keep the keys aligned to the trailing edge so they scan as a column.',
      shortcutNewOrder: 'New order',
      shortcutSearch: 'Open search',
      shortcutSidebar: 'Toggle sidebar',
      shortcutSaveDraft: 'Save draft',
      shortcutHelp: 'Keyboard shortcuts',
    },
    label: {
      title: 'Label',
      description:
        "Names a form control. Point htmlFor at the control's id so clicking the text focuses or toggles it, and a screen reader announces the two together.",
      basic: 'With an input',
      basicDescription:
        'The plain pairing: a label above the control it names.',
      withCheckbox: 'With a checkbox',
      withCheckboxDescription:
        'Put the label after the box and keep them on one line; the whole phrase becomes the click target.',
      acceptTerms: 'I accept the terms of service',
      sendCopy: 'Email me a copy of this order',
      withSwitch: 'With a switch',
      withSwitchDescription:
        'A switch takes effect immediately, so its label states what is on rather than what will be saved.',
      autoRenew: 'Renew this subscription automatically',
      withRadio: 'With a radio group',
      withRadioDescription:
        'Every option needs its own label and id; the group as a whole is named by a legend or a FieldLabel.',
      shippingStandard: 'Standard shipping',
      shippingExpress: 'Express shipping',
      shippingPickup: 'Collect in store',
      states: 'Required, optional and disabled',
      statesDescription:
        'Mark a required field with an asterisk plus text for screen readers, say “optional” in words, and let a disabled control dim its label through the group.',
      poNumber: 'Purchase order number',
      internalReference: 'Internal reference',
      taxId: 'Tax ID',
      notesPlaceholder:
        'Delivery instructions, access codes, anything the driver needs.',
      inField: 'Inside Field',
      inFieldDescription:
        'FieldLabel is this same label wired into the Field layout, so spacing, description text and error state come with it.',
      phoneHint:
        'Include the country code so delivery updates reach the customer.',
    },
    marker: {
      title: 'Marker',
      description:
        'A one-line note in a stream of content: who joined, when the day changed, what the system just did. It sits between messages rather than inside one.',
      basic: 'Event notes',
      basicDescription:
        'An icon and a sentence. Keep it to one line and name the actor, so the note reads as part of the history.',
      assigned: '{{agent}} was assigned to this ticket',
      tagged: 'Tagged as {{tag}}',
      priorityChanged: 'Priority changed from {{from}} to {{to}}',
      variants: 'Variants',
      variantsDescription:
        'Default is a plain line, separator draws a rule through it for a day break, and border boxes it for a log entry.',
      variantDefault: 'Delivery address updated',
      variantSeparator: 'Monday, 21 September',
      variantBorder: 'Exported 240 orders to CSV',
      status: 'Live status',
      statusDescription:
        'Add role="status" so a screen reader announces the change, and pair a spinner with the shimmer class while the work is still running.',
      agentTyping: '{{agent}} is typing…',
      syncingOrders: 'Syncing orders from the storefront…',
      syncComplete: 'Synced {{count}} orders',
      inConversation: 'In a conversation',
      inConversationDescription:
        'Separator markers break a thread into days and a plain marker records who joined it. Neither is a message, so neither takes a bubble.',
      customerAsks: 'My order still says processing. Has it shipped yet?',
      joined: '{{agent}} joined the conversation',
      agentReplies:
        'It left the warehouse this morning. I will send the tracking number shortly.',
      activityLog: 'An activity log',
      activityLogDescription:
        'The border variant turns a stream of markers into a record list, where each entry keeps its own outline.',
      invoiceCreated: 'Invoice {{invoice}} was created',
      statusChanged: 'Status changed from {{from}} to {{to}}',
      paymentReceived: 'Payment of {{amount}} received',
      interactive: 'Interactive markers',
      interactiveDescription:
        'Pass an anchor or a button through render when the note leads somewhere: the marker keeps its layout and the element keeps its semantics.',
      viewTicket: 'View the full ticket history',
      reopenTicket: 'Reopen this ticket',
      ticketReopened: 'Ticket reopened',
    },
    menubar: {
      title: 'Menubar',
      description:
        'A persistent row of menus for an editor-style screen. Reach for it when a page has many commands; a single button with a dropdown is enough for a few.',
      basic: 'Menus, groups and shortcuts',
      basicDescription:
        'Group related commands, separate the groups, and show the shortcut on the trailing edge of the item that has one.',
      invoice: 'Invoice',
      newInvoice: 'New invoice',
      duplicate: 'Duplicate',
      archive: 'Archive',
      print: 'Print',
      deleteInvoice: 'Delete invoice',
      undo: 'Undo',
      redo: 'Redo',
      cut: 'Cut',
      paste: 'Paste',
      help: 'Help',
      documentation: 'Documentation',
      keyboardShortcuts: 'Keyboard shortcuts',
      contactSupport: 'Contact support',
      submenu: 'Submenus',
      submenuDescription:
        'Nest one level for a set of formats or destinations. Deeper nesting is hard to reach with a pointer.',
      sendToCustomer: 'Send to customer',
      copyLink: 'Copy link',
      emailLink: 'Email link',
      checkbox: 'Checkbox items',
      checkboxDescription:
        'Each item toggles on its own and the menu stays open; disable the one that must always stay on.',
      view: 'View',
      columns: 'Columns',
      tax: 'Tax',
      discount: 'Discount',
      visibleColumns: 'Visible columns: {{columns}}',
      radio: 'Radio items',
      radioDescription:
        'One choice out of a set. The group holds the value, so the items only name the options.',
      density: 'Density',
      densityCompact: 'Compact',
      densityComfortable: 'Comfortable',
      currentDensity: 'Rows render at {{density}} density.',
    },
    message: {
      title: 'Message',
      description:
        'The layout of one turn in a conversation: avatar, header, bubble and footer. Bubble carries the text; Message positions the turn and its metadata.',
      conversation: 'A support thread',
      conversationDescription:
        'align="end" puts the customer on the trailing edge, markers break the thread into days, and a status marker shows who is typing.',
      customerAsks:
        'Order {{order}} still says processing. Has it shipped yet?',
      agentChecking:
        'Let me check with the warehouse and come back to you today.',
      agentShipped:
        'It shipped this morning. The tracking number is {{tracking}}.',
      agentEta: 'It should arrive on Wednesday before 18:00.',
      reactionThumbsUp: 'Thumbs up reaction',
      customerThanks: 'Perfect, thank you for checking.',
      read: 'Read {{time}}',
      typing: '{{agent}} is typing…',
      group: 'Consecutive messages',
      groupDescription:
        'MessageGroup tightens the spacing between turns from the same person; leave MessageAvatar empty on the ones that follow so the column stays aligned.',
      groupFirst: 'I have pulled up the order.',
      groupSecond: 'Two of the three items shipped yesterday.',
      groupThird: 'The third is on back order until Friday.',
      headerFooter: 'Header and footer',
      headerFooterDescription:
        'The header names the sender and their team; the footer carries the time and the delivery state. Keep both out of the bubble.',
      supportTeam: 'Support team',
      refundOffer:
        'I can refund the shipping fee or send a replacement. Which would you prefer?',
      refundAccept: 'A replacement would be great.',
      actions: 'Message actions',
      actionsDescription:
        'Put per-message actions in the footer: copy, feedback, and a retry when sending failed.',
      assistantAnswer:
        'An order moves to processing once payment clears, and to shipped when the warehouse scans the label.',
      helpful: 'Helpful',
      notHelpful: 'Not helpful',
      followUp: 'And how long does the warehouse usually take?',
      failedToSend: 'Not sent',
      retry: 'Retry sending',
      withAttachment: 'With an attachment',
      withAttachmentDescription:
        'An Attachment sits beside the bubble inside MessageContent, so the file belongs to the turn rather than to the text.',
      sendsInvoice: 'Here is the invoice for the replacement order.',
      confirmsInvoice:
        'Received, thank you. I have forwarded it to accounts payable.',
    },
    messageScroller: {
      title: 'Message Scroller',
      description:
        'A scroll viewport for a conversation: it follows new messages while the reader is at the bottom, and stops following the moment they scroll up.',
      liveThread: 'A live thread',
      liveThreadDescription:
        'Append a message and the viewport follows it. Scroll up first and it holds your place, showing the jump button instead.',
      ticketTitle: 'Ticket {{ticket}}',
      ticketSubject: 'Damaged item in delivery',
      scrollToLatest: 'Scroll to the latest message',
      appendMessage: 'Append a reply',
      appendHint:
        'Scroll up before appending to watch the viewport hold its position.',
      customerReport:
        'The parcel arrived today but the monitor screen is cracked.',
      agentAck: 'I am sorry about that. Could you send a photo of the damage?',
      customerDetails:
        'Just sent it. The box was dented on the left side as well.',
      agentInvestigating: 'Thank you. I am raising this with the carrier now.',
      agentFound: 'The carrier confirmed the damage happened in transit.',
      customerConfirm: 'Good to know. What happens next?',
      appendAgentFix: 'A replacement is on its way and arrives Thursday.',
      appendCustomerThanks: 'Thank you for sorting it out so quickly.',
      appendAgentClose:
        'I will close the ticket once you confirm the replacement arrived.',
      appendCustomerFollowUp:
        'Will do. One more thing: may I keep the damaged one?',
      ticketOpened: 'Ticket opened · 12 September',
      ticketClosed: 'Ticket closed · 15 September',
      jumpToStart: 'Jump to the first message',
      jumpToEnd: 'Jump to the last message',
      savedTranscript: 'A saved transcript',
      savedTranscriptDescription:
        'defaultScrollPosition="start" with autoScroll off opens a closed conversation at its beginning, which is how a record is read.',
      closedTranscript: 'Closed · read from the top',
      compact: 'Without a card',
      compactDescription:
        'The scroller is only a viewport, so it works inside any bordered box; add a start button when the reader may want to go back to the beginning.',
    },
    drawer: {
      title: 'Drawer',
      description:
        'A panel that slides in from an edge and can be dismissed with a swipe. Use it for a task the user finishes and leaves; Sheet is the plainer desktop-side variant.',
      basic: 'A bottom drawer',
      basicDescription:
        'The default rises from the bottom edge. showSwipeHandle adds the grab bar that tells a touch user it can be dragged away.',
      openOrderSummary: 'Open order summary',
      orderSummary: 'Order summary',
      orderSummaryDescription:
        'Three items in order {{number}}, ready to confirm.',
      confirmOrder: 'Confirm order',
      positions: 'Four edges',
      positionsDescription:
        'swipeDirection decides both the edge the panel sits on and the direction that dismisses it.',
      top: 'Top',
      right: 'Right',
      bottom: 'Bottom',
      left: 'Left',
      panelDescription: 'swipeDirection="{{direction}}" dismisses this panel.',
      controlled: 'Controlled, and responsive',
      controlledDescription:
        'Hold open in state when the drawer closes on a successful action. useIsMobile picks the edge, so one drawer rises on a phone and slides in on a desktop.',
      pickDeliveryTime: 'Pick a delivery time',
      deliveryDescription:
        'Choose a window for tomorrow. You can change it until the parcel is picked up.',
      standardDelivery: 'Standard delivery',
      fastest: 'Fastest',
      slotStandard: 'Arrives within two working days',
      slotAfterWork: 'Right after the working day',
      slotPopular: 'The most requested window',
      slotLast: 'The last run of the evening',
      confirmDelivery: 'Confirm this time',
      deliveryConfirmed: 'Delivery time confirmed',
      responsiveHint:
        'Resize the window: below 768px the drawer rises from the bottom instead.',
      snapPoints: 'Snap points',
      snapPointsDescription:
        'A partly open drawer shows a summary and expands to full height when the user drags it up.',
      openActivity: "Open today's activity",
      activity: "Today's activity",
      activityDescription: 'Drag the panel up to read the whole day.',
      paymentReceived: 'Payment received at {{time}}',
      nonModal: 'Non-modal',
      nonModalDescription:
        'modal={false} leaves the page behind it usable, so the reader can keep working while the panel stays open.',
      openNotes: 'Open notes',
      notesDescription:
        'The order stays readable behind this panel, so you can copy a detail straight into the note.',
      notesPlaceholder:
        'Anything the next person handling this order should know.',
    },
    dropdownMenu: {
      title: 'Dropdown Menu',
      description:
        'A menu of commands anchored to the control that opened it. Commands act; they do not hold a value the way a Select does.',
      basic: 'Groups, labels and shortcuts',
      basicDescription:
        'Group commands that belong together, separate the groups, and show the keyboard shortcut of the item that has one.',
      myAccount: 'My account',
      billing: 'Billing',
      team: 'Team',
      newTeam: 'New team',
      support: 'Support',
      apiAccess: 'API access',
      icons: 'With icons and a submenu',
      iconsDescription:
        'A leading icon speeds up recognition, and one level of nesting covers an action with a few destinations.',
      inviteUsers: 'Invite people',
      message: 'Message',
      copyInviteLink: 'Copy invite link',
      checkboxes: 'Checkbox items',
      checkboxesDescription:
        'Each item toggles independently and the menu stays open, which is what makes it right for column visibility.',
      columns: 'Columns',
      toggleColumns: 'Toggle columns',
      radio: 'Radio items',
      radioDescription:
        'One choice out of a set. The group holds the value and closes on selection, so the trigger can show the current choice.',
      sortBy: 'Sort by',
      rowActions: 'Row actions',
      rowActionsDescription:
        'An icon button opens the commands for one row; align the menu to the trailing edge and give the trigger an aria-label.',
      viewDetails: 'View details',
      duplicate: 'Duplicate',
      cancelOrder: 'Cancel order',
      lastAction: 'Last action: {{action}}',
      noAction: 'Open the menu and pick an action.',
    },
    field: {
      title: 'Field',
      description:
        'The layout of one control with its label, description and error. It wires the three together, so the control announces itself correctly without extra aria attributes.',
      form: 'A complete form',
      formDescription:
        'FieldSet and FieldLegend name a section, FieldGroup spaces the fields inside it, and FieldSeparator divides two sections.',
      customerDetails: 'Customer details',
      customerDetailsDescription:
        'Used on the invoice and on the shipping label.',
      fullName: 'Full name',
      namePlaceholder: 'Ava Chen',
      emailPlaceholder: 'ava.chen@northwind.example',
      emailHint: 'Order confirmations and delivery updates go here.',
      region: 'Region',
      notesPlaceholder:
        'Delivery instructions, access codes, anything the driver needs.',
      nameRequired: 'Enter the customer name.',
      emailRequired: 'Enter an email address.',
      emailInvalid: 'This does not look like an email address.',
      regionRequired: 'Choose a region.',
      preferences: 'Preferences',
      preferencesDescription:
        'These can be changed at any time from the customer record.',
      marketing: 'Send product news',
      marketingHint:
        'About one email a month. Unsubscribing never affects order updates.',
      invoiceCopy: 'Email a copy of every invoice',
      invoiceCopyHint: 'A PDF goes out as soon as the invoice is issued.',
      submitted: 'Saved.',
      orientations: 'Orientations',
      orientationsDescription:
        'Vertical stacks the label above the control, horizontal sits them on one line, and responsive switches between the two at the sm breakpoint.',
      vertical: 'Company name',
      companyPlaceholder: 'Northwind Traders',
      verticalHint: 'Appears on the invoice exactly as typed.',
      agreeTerms: 'I agree to the processing terms',
      responsive: 'Tax ID',
      responsiveHint:
        'Stacks on a narrow screen and sits on one line from sm upwards.',
      taxIdPlaceholder: 'DE 811 234 567',
      choiceCards: 'Choice cards',
      choiceCardsDescription:
        'Wrap a Field in FieldLabel to turn each option into a card, so the whole card becomes the click target.',
      shippingMethod: 'Shipping method',
      shippingStandard: 'Standard',
      shippingStandardHint: 'Arrives in three to five working days.',
      shippingExpress: 'Express',
      shippingExpressHint: 'Arrives the next working day before 18:00.',
      shippingOvernight: 'Overnight',
      shippingOvernightHint:
        'Ordered before 16:00, delivered by 09:00 tomorrow.',
      errors: 'Errors',
      errorsDescription:
        'FieldError renders one message, or a list when several rules fail at once. Set data-invalid on the Field and aria-invalid on the control.',
      password: 'Password',
      passwordTooShort: 'Use at least 12 characters.',
      passwordNeedsNumber: 'Include a number.',
      passwordNeedsSymbol: 'Include a symbol.',
    },
    input: {
      title: 'Input',
      description:
        'A single-line text field. Set type so the browser offers the right keyboard, validation and autofill, and pair it with Field for the label, hint and error.',
      types: 'Types',
      typesDescription:
        'The type is not decoration: it changes the on-screen keyboard, the autofill entry the browser offers, and the value the field reports.',
      namePlaceholder: 'Ava Chen',
      emailPlaceholder: 'ava.chen@northwind.example',
      password: 'Password',
      passwordPlaceholder: 'At least 12 characters',
      website: 'Website',
      search: 'Search',
      field: 'With a label and a hint',
      fieldDescription:
        'Field supplies the label, the description and the error slot, and connects all three to the input for a screen reader.',
      companyName: 'Company name',
      companyPlaceholder: 'Northwind Traders',
      companyHint: 'Appears on the invoice exactly as typed.',
      taxId: 'Tax ID',
      taxIdHint: 'Required for customers inside the EU.',
      states: 'States',
      statesDescription:
        'Disabled takes the field out of the form, read-only keeps its value submitted, and aria-invalid with data-invalid styles the error.',
      disabled: 'Order number',
      disabledHint: 'Assigned when the order is created.',
      readOnly: 'Customer ID',
      readOnlyHint: 'Submitted with the form but not editable.',
      emailInvalid: 'This does not look like an email address.',
      file: 'File input',
      fileDescription:
        'accept narrows the picker to the formats you can actually process. It is a hint, so the server still validates what arrives.',
      attachment: 'Signed delivery note',
      attachmentHint: 'PDF, PNG or JPG, up to 10 MB.',
      controlled: 'Controlled',
      controlledDescription:
        'Hold the value in state when you need to normalise or limit what is typed, and keep maxLength on the element so the browser enforces it too.',
      reference: 'Purchase order reference',
      referenceHint: 'Letters, digits and hyphens.',
    },
    separator: {
      title: 'Separator',
      description:
        'A thin rule that groups what belongs together and splits what does not. Prefer spacing first; reach for a separator only when two blocks would otherwise read as one.',
      horizontal: 'Horizontal',
      horizontalDescription:
        'The default direction, between stacked blocks inside a card or a form.',
      planLabel: 'Business plan, renews on Oct 1',
      accountSummary:
        'Invoices go to billing@northwind.io, and the card on file is charged on the first of each month.',
      vertical: 'Vertical',
      verticalDescription:
        'Separates items on one line, such as the metadata row under a title. Give the row a height for the rule to fill.',
      toolbar: 'In a toolbar',
      toolbarDescription:
        'Group related buttons and keep the destructive one apart from the rest.',
      list: 'Between list rows',
      listDescription:
        'A rule between summary rows is what turns a stack of numbers into a total.',
      subtotal: 'Subtotal',
      tax: 'Tax',
      shipping: 'Shipping',
    },
    sheet: {
      title: 'Sheet',
      description:
        'A panel that slides in from an edge. It covers less of the page than a dialog, which suits a detail view the reader came from the list to see.',
      basic: 'Basic',
      basicDescription:
        'A form in a sheet keeps the list behind it visible, so the reader does not lose their place.',
      editCustomer: 'Edit customer',
      editCustomerDescription: 'Changes are saved when the panel closes.',
      sides: 'Edges',
      sidesDescription:
        'Pick the edge that points at what opened it: right by default, left for navigation, bottom for a detail view on a narrow screen.',
      sideTop: 'Top',
      sideRight: 'Right',
      sideBottom: 'Bottom',
      sideLeft: 'Left',
      sidePreviewTitle: 'This panel opens from an edge',
      sidePreviewDescription:
        'The side prop sets where it comes from, and the width follows the content.',
      controlled: 'Controlled',
      controlledDescription:
        'Open the sheet from state when an action inside it changes the record the page is showing.',
      viewOrder: 'View order',
      orderDetails: 'Order details',
      orderDetailsDescription: 'Review the order before it ships.',
      markShipped: 'Mark as shipped',
      scrollable: 'Long content',
      scrollableDescription:
        'A pinned header and footer with a scrolling body keeps the actions reachable in a long record.',
      activityLog: 'Activity log',
      activityLogDescription:
        'Everything that happened to this order, newest first.',
    },
    sidebar: {
      title: 'Sidebar',
      description:
        'The persistent navigation of an application: groups of links, a header for the workspace and a footer for the account.',
      composition: 'Composition',
      compositionDescription:
        'A provider, a sidebar and an inset: the inset is the page area, so the sidebar scrolls independently of it.',
      enterprisePlan: 'Enterprise plan',
      platform: 'Platform',
      dashboard: 'Dashboard',
      orders: 'Orders',
      customers: 'Customers',
      products: 'Products',
      projects: 'Projects',
      addProject: 'Add project',
      collapsible: 'Collapsible groups',
      collapsibleDescription:
        'One branch opens in place, with the chevron rotating and the sub-items indented under their parent.',
      allOrders: 'All orders',
      returns: 'Returns',
      drafts: 'Drafts',
      support: 'Support',
      collapsibleHint:
        'The trigger in the header collapses the sidebar to icon mode.',
      loading: 'Loading',
      loadingDescription:
        'A skeleton keeps the sidebar the same width while the workspace loads, so the page does not shift.',
    },
    skeleton: {
      title: 'Skeleton',
      description:
        'A placeholder that holds the shape of the content while it loads. Match the final layout so nothing jumps when the data arrives.',
      card: 'Card',
      cardDescription:
        'Repeat the blocks the real card has, such as title, media and actions, rather than one grey rectangle.',
      tableRows: 'Table rows',
      tableRowsDescription:
        'Skeleton rows keep the table height and the column widths stable while it loads.',
      list: 'List',
      listDescription:
        'An avatar, two lines of text and a trailing action is the shape most list rows share.',
      form: 'Form',
      formDescription:
        'One block per field, in the order the fields will appear.',
      matchContent: 'Matching the content',
      matchContentDescription:
        'Toggle to compare: the placeholder only works while its width and height match what replaces it.',
      showContent: 'Show content',
      showSkeleton: 'Show skeleton',
    },
    slider: {
      title: 'Slider',
      description:
        'Picks a value from a range where an approximate choice is enough. For an exact number, use an input.',
      basic: 'Basic',
      basicDescription:
        'Show the current value beside the label, and the range the track covers when it is not obvious.',
      discount: 'Discount',
      controlled: 'Controlled',
      controlledDescription:
        'Keep the value in state so the formatted figure above updates as the handle moves.',
      monthlyBudget: 'Monthly budget',
      range: 'A range',
      rangeDescription:
        'Pass two values to pick a floor and a ceiling, and set minStepsBetweenValues so the handles cannot cross.',
      priceRange: 'Price range',
      vertical: 'Vertical',
      verticalDescription:
        'A vertical slider fits a compact column, such as thresholds beside a chart.',
      lowStockAlert: 'Low stock alert',
      reorderLevel: 'Reorder level',
      disabled: 'Disabled',
      disabledDescription:
        'Disable the slider when the value comes from policy rather than from the reader, and show the value it holds.',
      approvedDiscount: 'Approved discount',
    },
    spinner: {
      title: 'Spinner',
      description:
        'Shows that the interface is working on something. Use it for a wait the reader cannot measure.',
      sizes: 'Sizes',
      sizesDescription:
        'Match the text beside it: size-3 inline in a sentence, size-4 in a button, size-6 or size-8 on its own.',
      inButtons: 'In a button',
      inButtonsDescription:
        'Disable the button while the request runs and keep its label, so the button does not change width.',
      saving: 'Saving',
      processingPayment: 'Processing payment',
      uploading: 'Uploading',
      inBadges: 'In a badge',
      inBadgesDescription:
        'A short status reads well as a badge with a spinner in front of it.',
      syncing: 'Syncing',
      updating: 'Updating',
      inline: 'Inline',
      inlineDescription:
        'A spinner beside a line of text covers the refresh that has no button of its own.',
      refreshingOrders: 'Refreshing orders…',
      panel: 'A whole panel',
      panelDescription:
        'When the panel has nothing to show yet, centre the spinner and say what is loading.',
      loadingReport: 'Loading the report…',
    },
    switch: {
      title: 'Switch',
      description:
        'Turns one setting on or off, applied immediately. Use a checkbox when the choice is submitted with a form.',
      basic: 'Basic',
      basicDescription:
        'A switch takes effect as it moves, so put it beside the label of what it controls and give it no save button of its own.',
      emailNotifications: 'Email notifications',
      controlled: 'Controlled',
      controlledDescription:
        'Hold the value in state when the page has to show the result somewhere else as well.',
      publishProduct: 'Publish product',
      withDescription: 'With a description',
      withDescriptionDescription:
        'A setting the reader has to think about needs a sentence explaining what it does.',
      twoFactor: 'Two-factor authentication',
      twoFactorDescription:
        'Require a code from your phone after the password.',
      choiceCards: 'A list of settings',
      choiceCardsDescription:
        'Stack several switches with their descriptions when they belong to one settings screen.',
      orderUpdates: 'Order updates',
      orderUpdatesDescription: 'Email me when an order is placed or shipped.',
      marketingEmails: 'Marketing emails',
      marketingEmailsDescription: 'Product news, at most once a month.',
      weeklyDigest: 'Weekly digest',
      weeklyDigestDescription: 'A Monday summary of last week.',
      sizes: 'Sizes',
      sizesDescription:
        'The default size suits a settings row; sm fits a dense toolbar or a table row.',
      small: 'Small',
      default: 'Default',
      states: 'States',
      statesDescription:
        'A disabled switch still shows which way it is set, so the reader can see what they cannot change.',
      disabledOff: 'Disabled, off',
      disabledOn: 'Disabled, on',
      acceptTerms: 'Accept the terms',
      acceptTermsDescription:
        'A rejected switch needs its reason underneath; the error text belongs to the field, not to the control.',
    },
    table: {
      title: 'Table',
      description:
        'Static table primitives — table, header, body, footer, caption — that you compose yourself. For sorting and paging over data, use DataTable.',
      invoices: 'Invoices',
      invoicesDescription:
        'A caption names the table for screen readers, and a footer row carries the total.',
      invoicesCaption: 'Invoices issued in the last 30 days.',
      invoice: 'Invoice',
      paymentMethod: 'Method',
      compact: 'Compact',
      compactDescription:
        'Tighten the cell padding and the text size when the table sits inside a card or a side panel.',
      selectable: 'Selectable rows',
      selectableDescription:
        'Select all sits in the header and one box in each row, with the count above the table.',
      selectedCount: '{{selected}} of {{total}} selected',
      selectAll: 'Select every row',
      inCard: 'Inside a card',
      inCardDescription:
        'A card header names the list and carries its actions, so the table needs no title of its own.',
      recentOrders: 'Recent orders',
      recentOrdersDescription: 'The last five orders placed by any customer.',
      order: 'Order',
    },
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
