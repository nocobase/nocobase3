import type { AppClientPluginBootstrap } from '@nocobase/app-client/plugins';
import type { AppClient } from '@nocobase/app-sdk';
import { registerAppSettingsModule } from '@nocobase/app-plugin-settings/client';

const bootstrap: AppClientPluginBootstrap = ({ appClient }) => {
  registerAppAccessControlSettingsModules(appClient);
};

export function registerAppAccessControlSettingsModules(
  appClient: AppClient,
): void {
  registerAppSettingsModule(appClient, '@nocobase/app-plugin-access-control', {
    id: 'users',
    title: '用户与组织',
    description: '管理当前 App 的登录账号、成员状态和角色分配。',
    group: '账号与权限',
    status: '已接入',
    owner: '访问控制插件',
    boundary:
      '账号与成员数据归当前 App 所有，Hub 只负责平台级身份和 App 入口。',
    icon: 'users',
    priority: 10,
    pageLoader: () => import('./members-page.js'),
  });
  registerAppSettingsModule(appClient, '@nocobase/app-plugin-access-control', {
    id: 'roles',
    title: '角色',
    description: '查看当前 App 的职责角色、成员数量和权限入口。',
    group: '账号与权限',
    status: '已接入',
    owner: '访问控制插件',
    boundary: '角色定义由 App 提供，管理交互和数据模型由公共插件提供。',
    icon: 'key',
    priority: 20,
    pageLoader: () => import('./roles-page.js'),
  });
  registerAppSettingsModule(appClient, '@nocobase/app-plugin-access-control', {
    id: 'permissions',
    title: '权限',
    description: '按角色配置当前 App 的业务资源操作和数据范围。',
    group: '账号与权限',
    status: '已接入',
    owner: '访问控制插件',
    boundary: '界面、服务端校验和审计使用同一份 App 独立权限数据。',
    icon: 'shield',
    priority: 30,
    pageLoader: () => import('./permission-editor.js'),
  });
}

export default bootstrap;
