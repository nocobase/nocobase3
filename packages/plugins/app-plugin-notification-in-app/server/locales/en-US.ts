import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  test: {
    channels: { inApp: 'In-app' },
    providers: { database: 'Database' },
    fields: {
      recipientUserId: 'Recipient user ID',
      title: 'Title',
      message: 'Message',
    },
    placeholders: { currentUser: 'Defaults to the current user' },
    defaults: {
      title: 'NocoBase notification test',
      body: 'This is a test notification from NocoBase.',
    },
  },
};

export type InAppNotificationResource = LocaleResource<typeof enUS>;
export default enUS;
