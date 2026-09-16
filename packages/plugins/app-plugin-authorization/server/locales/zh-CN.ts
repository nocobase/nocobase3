import type { AuthorizationServerResource } from './en-US.js';

const zhCN: AuthorizationServerResource = {
  options: {
    actions: {
      read: '读取',
      create: '创建',
      update: '更新',
      delete: '删除',
      access: '访问',
    },
    resourceTypes: {
      page: '页面',
      collection: '数据表',
      settings: '后台设置',
    },
    settingsModules: { authorization: '权限管理' },
    pages: {
      all: '所有页面',
      allDescription: '允许访问所有页面，包括之后新增的页面。',
    },
    settings: {
      'permission-sets': '权限集',
      'default-access': '默认访问',
      'sharing-rules': '共享规则',
      'restriction-rules': '限制规则',
    },
    subjectTypes: {
      authenticated: '所有已登录用户',
      authenticatedDescription: '适用于每一个拥有有效登录会话的用户。',
      user: '指定用户',
    },
    recordAccessPolicies: {
      allRecords: '全部记录',
      recordsIOwn: '我拥有的记录',
      recordsICreated: '我创建的记录',
      customFilter: '自定义筛选',
      customFilterHint: '使用自定义筛选条件选择记录。',
    },
  },
};

export default zhCN;
