import type { NotificationServerResource } from './en-US.js';

const zhCN: NotificationServerResource = {
  test: {
    channels: { email: '邮件', im: '即时通讯', inApp: '站内信' },
    providers: {
      smtp: 'SMTP',
      resend: 'Resend',
      feishuWebhook: '飞书 Webhook',
      dingtalkWebhook: '钉钉 Webhook',
      database: '数据库',
    },
    fields: {
      recipient: '收件人',
      recipientUserId: '接收用户 ID',
      title: '标题',
      message: '消息',
    },
    placeholders: {
      email: 'name@example.com',
      currentUser: '默认发送给当前用户',
    },
    defaults: {
      title: 'NocoBase 通知测试',
      body: '这是一条来自 NocoBase 的测试通知。',
    },
  },
  errors: {
    testDisabled: '通知测试功能不可用。',
    testHeaderRequired: '缺少通知测试请求头。',
    testForbidden: '需要发送通知测试的权限。',
    testInvalidRequest: '请求体必须包含测试目标和字段值。',
    testTargetUnavailable: '通知测试目标不可用。',
    testUnknownField: '未知的通知测试字段“{{name}}”。',
    testRequiredField: '通知测试字段“{{name}}”为必填项。',
    testFieldTooLong: '通知测试字段“{{name}}”最多允许 {{maxLength}} 个字符。',
    testFailed: '通知测试失败。',
    testNotFound: '未找到通知测试记录。',
  },
};

export default zhCN;
