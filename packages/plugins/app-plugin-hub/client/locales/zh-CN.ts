import type { HubResource } from './en-US.js';

const zhCN: HubResource = {
  navigation: {
    applications: '应用管理',
    userAccess: '用户与权限',
    roles: '角色权限',
  },
  roles: {
    title: '角色权限',
    description: '对比各 Hub 角色可以使用的功能。',
    loading: '正在加载角色…',
    loadFailed: '角色权限加载失败。',
    retry: '重试',
    capability: '能力',
    allowed: '允许',
    notAllowed: '不允许',
    names: {
      'hub-administrator': '管理员',
      'hub-operator': '运维人员',
      'hub-viewer': '查看者',
    },
    descriptions: {
      'hub-administrator': '完整管理应用、运维操作和用户权限',
      'hub-operator': '创建、配置、发布和运维应用',
      'hub-viewer': '仅查看应用和运行状态',
    },
    groups: {
      visibility: '应用与状态',
      operations: '发布与运维',
      'user-management': '用户管理',
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
