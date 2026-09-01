import type { AppResource } from './en-US.js';

const zhCN: AppResource = {
  app: {
    title: 'NocoBase',
  },
  actions: {
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    language: '语言',
  },
  account: {
    openMenu: '打开账户菜单',
    fallback: '账户',
    signOut: '退出登录',
    signingOut: '正在退出…',
  },
  navigation: {
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },
  sidebarFooter: {
    title: 'NocoBase Hub',
    description: '管理 APP 的版本、部署与运行。',
    version: '版本 {{version}}',
  },
};

export default zhCN;
