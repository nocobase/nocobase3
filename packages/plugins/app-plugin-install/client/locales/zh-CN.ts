import type { InstallClientResource } from './en-US.js';

const zhCN: InstallClientResource = {
  brand: 'NocoBase 安装',
  form: {
    title: '安装你的应用',
    description: '为此应用配置数据库。系统会自动生成安全的身份认证密钥。',
    database: '数据库',
    databaseFile: '数据库文件',
    databaseName: '数据库名称',
    host: '主机',
    port: '端口',
    username: '用户名',
    password: '密码',
    schema: 'Schema',
    useSsl: '使用 SSL',
    charset: '字符集',
    debugLogging: '启用数据库调试日志',
    save: '保存配置',
    saving: '正在保存配置…',
  },
  success: {
    eyebrow: '配置已完成',
    title: '数据库配置已保存',
    description:
      '数据库配置已经保存。请重启应用以完成安装。此页面会持续检查，应用就绪后将自动进入登录页。',
    nextStep: '下一步',
    restartTitle: '重启应用',
    restartDescription:
      '请使用进程管理器或 NocoBase Hub 中的“重新启动”操作，然后回到这里。无需再次提交表单。',
    waiting: '正在等待应用重启…',
    checking: '正在检查应用状态…',
    ready: '应用已就绪，正在跳转…',
    checkAgain: '重新检查',
  },
  errors: {
    save: '无法保存应用配置。',
    status: '无法检查安装状态。',
    statusDescription: '请确认应用服务正在运行，然后重试。',
    retry: '重试',
  },
};

export default zhCN;
