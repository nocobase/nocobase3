import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  test: {
    channels: { email: 'Email', im: 'IM', inApp: 'In-app' },
    providers: {
      smtp: 'SMTP',
      resend: 'Resend',
      feishuWebhook: 'Feishu webhook',
      dingtalkWebhook: 'DingTalk webhook',
      database: 'Database',
    },
    fields: {
      recipient: 'Recipient',
      recipientUserId: 'Recipient user ID',
      title: 'Title',
      message: 'Message',
    },
    placeholders: {
      email: 'name@example.com',
      currentUser: 'Defaults to the current user',
    },
    defaults: {
      title: 'NocoBase notification test',
      body: 'This is a test notification from NocoBase.',
    },
  },
  errors: {
    testDisabled: 'Notification testing is not available.',
    testHeaderRequired: 'The notification test request header is required.',
    testForbidden: 'Notification test send permission is required.',
    testInvalidRequest:
      'Request body must contain a test target and field values.',
    testTargetUnavailable: 'Notification test target is unavailable.',
    testUnknownField: 'Unknown notification test field "{{name}}".',
    testRequiredField: 'Notification test field "{{name}}" is required.',
    testFieldTooLong:
      'Notification test field "{{name}}" must be at most {{maxLength}} characters.',
    testFailed: 'Notification test failed.',
    testNotFound: 'Notification test was not found.',
  },
};

export type NotificationServerResource = LocaleResource<typeof enUS>;
export default enUS;
