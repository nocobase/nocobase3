import type { AppResource } from './en-US.js';

const zhCN: AppResource = {
  examples: {
    eyebrow: 'NocoBase 示例中心',
    title: '从可运行的示例开始',
    description:
      '体验完整功能，理解应用如何构建。管理文章、探索关联数据，通过实际操作了解各项能力。',
    start: '从文章管理开始',
    open: '打开示例',
    accessNote:
      '示例沿用应用的登录和权限体系。建议使用管理员账号体验；其他账号需要对应的功能权限。',
    articles: {
      title: '文章管理',
      description:
        '完整的应用业务示例，包含初始化内容、搜索、草稿、发布和编辑。',
    },
    repository: {
      title: '数据查询',
      description: '体验记录查询、筛选、排序、分页和关联数据读取。',
    },
    crm: {
      title: '客户与联系人',
      description: '浏览 CRM 示例，了解客户和联系人之间的关联。',
    },
    orders: {
      title: '订单与商品',
      description: '通过订单、明细和商品，体验关联业务数据的管理方式。',
    },
    files: {
      title: '文件管理',
      description: '体验文件仓库示例中的上传入口和文件管理界面。',
    },
    routes: {
      title: '应用路由',
      description: '了解插件页面如何接入应用，并复用导航和页面布局。',
    },
  },
  articles: {
    title: '文章',
    workspace: '内容工作台',
    description: '记录想法、分享知识，让每一篇内容都井井有条。',
    new: '新建文章',
    edit: '编辑文章',
    all: '全部文章',
    published: '已发布',
    draft: '草稿',
    archived: '已归档',
    filter: '按状态筛选',
    search: '搜索文章标题…',
    loading: '正在加载文章…',
    loadError: '文章加载失败，请检查网络连接和文章访问权限。',
    retry: '重试',
    empty: '没有找到文章',
    emptyHint: '换个关键词，或创建你的第一篇文章。',
    noSummary: '暂无摘要',
    read: '阅读文章',
    total: '共 {{count}} 篇文章',
    previous: '上一页',
    next: '下一页',
    preview: '文章预览',
    noContent: '暂无正文',
    editorHint: '先保存为草稿，准备就绪后再发布。',
    fieldTitle: '标题',
    summary: '摘要',
    content: '正文',
    status: '状态',
    saveError: '保存失败，请检查权限后重试。',
    saving: '正在保存…',
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
    close: '关闭',
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
    articles: '文章',
    home: '首页',
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },
};

export default zhCN;
