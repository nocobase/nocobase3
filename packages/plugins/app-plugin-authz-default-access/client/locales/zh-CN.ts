export default {
  resourceTitle: '默认访问',
  navigation: { title: '默认访问' },
  defaultAccess: {
    supportedScope:
      '仅显示支持配置数据范围的资源类型。可在此设置各操作的默认记录范围。',
    groupFilter: '资源分组',
    allGroups: '全部分组',
    inlineHint: '简单范围修改后立即保存；指定范围在抽屉中配置并保存。',
    saved: '已保存',
    editScope: '编辑范围',
    back: '返回默认访问',

    configureResource: '配置资源',
    configure: '配置',
    chooseResource: '选择资源，设置各操作的默认记录范围。',
    configured: '已配置',
    noDefault: '不设置默认范围',
    customScope: '指定范围',

    page: {
      title: '默认访问',
      description:
        '为已有操作权限的用户提供基础记录范围，不授予操作或字段权限。实际访问范围还受共享规则和限制规则影响。',
    },
    search: '搜索规则',
    create: '设置默认访问',
    recordAccessHeader: '默认记录访问',
    allowedActions: '允许的操作',
    emptyNone: '尚未设置默认访问，访问范围由权限集和其他规则决定。',
    emptySearch: '没有匹配搜索条件的默认访问规则。',
    pagerLabel: '默认访问规则',
    editTitle: '编辑默认访问',
    newTitle: '设置默认访问',
    editorDescription: '为已有操作权限的用户设置基础记录范围。',
    resourceHeading: '资源',
    resourceDescription: '选择要设定基础访问的数据表。',
    accessHeading: '按操作设置访问',
    accessDescription: '为每个操作分别设置记录范围。',
    deleteRule: '删除规则',
    save: '保存默认访问',
    confirmDeleteTitle: '确定移除该默认配置吗？',
    confirmDeleteBody:
      '移除“{{resource}}”的默认配置。实际访问范围由剩余权限集和规则决定。',
  },
};
