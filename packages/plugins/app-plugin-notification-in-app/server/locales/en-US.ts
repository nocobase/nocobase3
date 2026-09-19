import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  errors: {
    authenticationRequired: 'Authentication required.',
    invalidLimit: 'limit must be an integer between 1 and {{max}}.',
    invalidCursor: 'cursor is invalid.',
    invalidCsrf: 'Invalid CSRF token.',
    invalidBody: 'Request body must be a JSON object.',
    invalidAction: 'action must be read, unread, or delete.',
    notFound: 'Not found.',
  },
  test: {
    channels: { inApp: 'In-app' },
    providers: { builtIn: 'Built-in' },
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
