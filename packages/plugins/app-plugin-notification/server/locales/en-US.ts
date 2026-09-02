import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
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
