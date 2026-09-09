import type { HubResource } from './en-US.js';

const zhCN: HubResource = {
  navigation: {
    applications: '应用管理',
    userAccess: '用户与权限',
    roles: '角色权限',
  },
  roles: {
    eyebrow: '用户与权限',
    title: '角色权限',
    description: '查看 Hub 各固定角色能够执行的操作。',
    loading: '正在加载角色…',
    loadFailed: '角色权限加载失败。',
    retry: '重试',
    capability: '能力',
    allowed: '允许',
    notAllowed: '不允许',
    note: 'Hub 角色为固定角色。如需调整用户角色，请前往用户管理。',
    names: {
      'hub-administrator': '管理员',
      'hub-operator': '运维人员',
      'hub-viewer': '查看者',
    },
    capabilities: {
      'view-status': '查看应用、版本、部署和 Host 状态',
      'view-resources': '查看 Resources 和原始配置',
      'create-release': '创建应用和上传版本',
      operate: '部署、回滚、启动、停止和重启应用',
      configure: '修改应用设置和配置',
      remove: '删除应用',
      'manage-users': '管理用户和分配角色',
    },
  },
};

export default zhCN;
