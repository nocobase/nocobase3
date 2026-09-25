import type { DepartmentsExampleResource } from './en-US.js';

const zhCN: DepartmentsExampleResource = {
  navigation: {
    organization: '组织架构',
    directory: '部门目录',
  },
  organization: {
    title: '组织架构',
    description:
      '部门及其成员。在权限中分配给某个部门的权限集，会作用于该部门及其所有下级部门的成员。',
    tree: '部门',
    newTitle: '新顶级部门的名称',
    add: '添加部门',
    enable: '启用',
    disable: '停用',
    disabled: '已停用',
    empty: '暂无部门。',
    select: '选择一个部门以管理其成员。',
    loading: '加载中…',
    failed: '无法加载组织架构。',
    forbidden: '你无权查看组织架构。',
    retry: '重试',
    saveFailed: '无法保存更改。',
  },
  department: {
    notFound: '该部门不存在。',
    parent: '上级：{{title}}',
    topLevel: '顶级部门',
    childTitle: '新下级部门的名称',
    addChild: '添加下级部门',
    members: '成员',
    noMembers: '没有直属成员。',
    primary: '主部门',
    setPrimary: '设为主部门',
    remove: '移除',
    searchUsers: '搜索要添加的用户',
    addMember: '添加',
    noUsers: '没有匹配的用户。',
  },
  directory: {
    title: '部门目录',
    description: '你的权限允许你查看的部门：你所在的部门，以及共享给你的部门。',
    empty: '没有你可见的部门。',
    failed: '无法加载部门目录。',
    forbidden: '你无权查看部门目录。',
    retry: '重试',
  },
};

export default zhCN;
