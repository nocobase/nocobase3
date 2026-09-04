import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  nav: {
    settings: 'Mail',
    dev: 'Mail playground',
  },
  actions: {
    refresh: 'Refresh',
    reloadAccounts: 'Reload accounts',
  },
  settings: {
    eyebrow: 'Communication',
    title: 'Mail settings',
    description:
      'Connect a mailbox and control how much history the first synchronization imports.',
    loading: 'Loading mail configuration…',
    authorizationSuccess: 'The mail account is connected.',
    authorizationFailure: 'The mail account could not be connected. Try again.',
    initialSync: {
      title: 'Initial sync limits',
      description:
        'Bound the first import so a large mailbox is processed in resumable batches. Incremental sync takes over after the baseline completes.',
      receivedAfter: 'Import messages received after',
      maxMessages: 'Maximum messages',
      batchSize: 'Messages per batch',
    },
    providers: {
      title: 'Providers',
      description:
        'Only Providers configured and enabled by the server are shown.',
      emptyTitle: 'No mail Providers configured',
      emptyDescription:
        'Add a Gmail or Microsoft Provider to the server mail configuration.',
      connect: 'Connect account',
      connected: '{{count}} connected',
    },
    accounts: {
      title: 'Connected accounts',
      description:
        'Start a bounded initial import, then request incremental synchronization whenever needed.',
      emptyTitle: 'No accounts connected',
      emptyDescription: 'Connect a Provider above to add a mailbox.',
      default: 'Default',
      sync: 'Sync mailbox',
      syncProgress: '{{messages}} messages in {{pages}} batches',
    },
  },
  dev: {
    eyebrow: 'Development tools',
    title: 'Mail playground',
    description:
      'Exercise the send and synchronization APIs against a connected account. This route is excluded from production builds.',
    account: 'Account',
    identity: 'Sending identity',
    noAccounts: 'No connected accounts',
    send: {
      title: 'Send a message',
      description:
        'Each submission receives a fresh idempotency key and runs through the Mail send operation.',
      to: 'To',
      toPlaceholder: 'alice@example.com, bob@example.com',
      subject: 'Subject',
      subjectPlaceholder: 'NocoBase mail test',
      body: 'Plain-text body',
      bodyPlaceholder:
        'This message was sent from the NocoBase Mail development page.',
      sending: 'Submitting…',
      submit: 'Submit message',
      accepted: 'Submission',
    },
    sync: {
      title: 'Synchronize mailbox',
      description:
        'Use bounded initial sync for a new account. Use incremental sync after a baseline cursor exists.',
      mode: 'Mode',
      initial: 'Initial',
      incremental: 'Incremental',
      start: 'Start sync',
      run: 'Sync run',
    },
    messages: {
      title: 'Synchronized messages',
      empty: 'No local messages are available. Run a synchronization first.',
      noSubject: '(no subject)',
      unknownSender: 'Unknown sender',
    },
  },
  capabilities: {
    receive: 'Receive',
    send: 'Send',
    incrementalSync: 'Incremental sync',
    pushNotifications: 'Push notifications',
    folders: 'Folders',
    labels: 'Labels',
    drafts: 'Drafts',
    moveMessage: 'Move messages',
    aliases: 'Aliases',
  },
  status: {
    account: {
      connecting: 'Connecting',
      active: 'Active',
      reauthorizationRequired: 'Reauthorization required',
      suspended: 'Suspended',
      revoked: 'Revoked',
      removing: 'Removing',
    },
    sync: {
      pending: 'Pending',
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    },
  },
  errors: {
    requestFailed: 'Mail request failed.',
    authorizationFailed: 'Could not start mail authorization.',
    syncFailed: 'Could not start mailbox synchronization.',
    sendFailed: 'Could not submit the message.',
  },
};

export type MailResource = LocaleResource<typeof enUS>;

export default enUS;
