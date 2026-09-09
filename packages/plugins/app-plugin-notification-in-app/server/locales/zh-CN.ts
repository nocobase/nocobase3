import type { InAppNotificationResource } from './en-US.js';

const zhCN: InAppNotificationResource = {
  errors: {
    authenticationRequired: '需要登录。',
    invalidLimit: 'limit 必须是 1 到 {{max}} 之间的整数。',
    invalidCursor: 'cursor 无效。',
    invalidCsrf: 'CSRF token 无效。',
    invalidBody: '请求体必须是 JSON 对象。',
    invalidAction: 'action 必须是 read、unread 或 delete。',
    notFound: '未找到记录。',
  },
  test: {
    channels: { inApp: '站内信' },
    providers: { builtIn: '系统内置' },
    fields: {
      recipientUserId: '接收用户 ID',
      title: '标题',
      message: '消息',
    },
    placeholders: { currentUser: '默认发送给当前用户' },
    defaults: {
      title: 'NocoBase 通知测试',
      body: '这是一条来自 NocoBase 的测试通知。',
    },
  },
};

export default zhCN;
