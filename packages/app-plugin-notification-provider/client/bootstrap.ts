import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';
import { registerAppSettingsModule } from '@nocobase/app-plugin-settings/client';

import { createNotificationProvider } from './notification-provider.js';

const bootstrap: AppClientPluginBootstrap = ({ appClient, refine }) => {
  refine.setNotificationProvider(createNotificationProvider());
  registerAppSettingsModule(
    appClient,
    '@nocobase/app-plugin-notification-provider',
    {
      id: 'notifications',
      title: '通知',
      description: '管理站内信、邮件及其他通知渠道和模板。',
      group: '数据与集成',
      status: '模块接入中',
      owner: '通知模块',
      boundary: '前端通知反馈已接入；渠道、模板和发送记录由通知模块继续补齐。',
      icon: 'bell',
      priority: 30,
    },
  );
};

export default bootstrap;
