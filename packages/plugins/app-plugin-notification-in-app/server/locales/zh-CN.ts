import type { InAppNotificationResource } from './en-US.js';

const zhCN: InAppNotificationResource = {
  test: {
    channels: { inApp: '站内信' },
    providers: { database: '数据库' },
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
