import type { NotificationProvidersResource } from './en-US.js';

const zhCN: NotificationProvidersResource = {
  test: {
    channels: { email: '邮件', im: '即时通讯' },
    providers: {
      smtp: 'SMTP',
      resend: 'Resend',
      feishuWebhook: '飞书 Webhook',
      dingtalkWebhook: '钉钉 Webhook',
    },
    fields: { recipient: '收件人', title: '标题', message: '消息' },
    placeholders: { email: 'name@example.com' },
    defaults: {
      title: 'NocoBase 通知测试',
      body: '这是一条来自 NocoBase 的测试通知。',
    },
  },
};

export default zhCN;
