import type { AppResource } from './en-US.js';

const zhCN: AppResource = {
  shell: {
    buildFreely: 'AI 自由构建。',
    reliability: '<brand>NocoBase</brand> 保障可靠。',
  },
  surface: {
    backToApp: '返回应用',
    loading: '正在加载{{title}}',
    navigation: '{{title}}导航',
    page: '{{title}}页面',
  },
  settings: {
    title: '设置',
    emptyTitle: '暂无可用设置',
    emptyDescription: '没有已启用的插件提供你有权访问的设置页面。',
  },
  dev: {
    title: '开发工具',
    emptyTitle: '暂无可用开发工具',
    emptyDescription: '没有已启用的插件提供你有权访问的开发页面。',
  },
  appearance: {
    title: '外观',
    mode: '颜色模式',
    preset: '主题',
    light: '浅色',
    dark: '深色',
    system: '跟随系统',
    themes: { default: '默认', compact: '紧凑' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    language: '语言',
  },
  notices: {
    serverLocaleFallback: '服务端不支持该语言，服务端内容已回落为英文。',
    languageChangeFailed: '未能完成语言切换，请重试。',
  },
  account: {
    signOutFailed: '退出登录失败，请重试。',
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
    breadcrumb: '面包屑',
    console: 'Hub 控制台',
  },
};

export default zhCN;
