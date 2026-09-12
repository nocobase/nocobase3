import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  test: {
    channels: { email: 'Email', im: 'IM' },
    providers: {
      smtp: 'SMTP',
      resend: 'Resend',
      feishuWebhook: 'Feishu webhook',
      dingtalkWebhook: 'DingTalk webhook',
    },
    fields: { recipient: 'Recipient', title: 'Title', message: 'Message' },
    placeholders: { email: 'name@example.com' },
    defaults: {
      title: 'NocoBase notification test',
      body: 'This is a test notification from NocoBase.',
    },
  },
};

export type NotificationProvidersResource = LocaleResource<typeof enUS>;
export default enUS;
