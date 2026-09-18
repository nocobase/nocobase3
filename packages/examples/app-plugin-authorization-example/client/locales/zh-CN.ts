export default {
  practice: {
    intro:
      '请使用下方示例账号，不要使用管理员验证权限；管理员不受这些限制。每组练习均从初始业务记录状态开始。',
    read: {
      title: '只读与指定记录共享',
      steps:
        '以 sales_assistant 登录：项目中可见 project-1、project-2、project-3，但不可编辑；报价和订单仍仅限本人负责的项目。',
      reason:
        '项目共享仅开放查看，不授予编辑，也不会连带开放关联记录。涉密 project-4 始终被限制规则排除。',
    },
    scopes: {
      title: '两个独立的提交范围',
      steps:
        '以 sales_engineer 登录：quote-2 可成功提交；quote-5 由同事编制，不可提交；quote-6 属于外区域项目，不可提交。',
      reason:
        '报价编制人与项目区域分别校验。已有订单引用独立的已确认报价；提交练习报价不会自动创建订单。',
    },
    teams: {
      title: '团队交接与撤销',
      steps:
        '以 sales_proposal 登录并提交 quote-7。重置记录后，管理员仅移除方案团队交接共享中的项目范围，再次提交应被拒绝；恢复 project-3 的项目范围后即可提交。',
      reason:
        'quote-7 由同事编制，project-3 位于团队区域外，两个共享范围缺一不可。移除团队成员或团队工程师角色也会拒绝提交；sales_coordinator 退出团队后仍保留直接分配的项目经理角色。sales_dispatch 用于验证团队继承的交付权限。',
    },
  },
  reset: {
    action: '重置练习记录',
    cancel: '取消',
    confirm:
      '将恢复所有示例账号共用的初始项目、报价和订单，这些记录上的修改将被覆盖。确认重置？',
    description:
      '重复练习或切换交付账号前，管理员可在此重置业务记录。账号、团队成员和权限配置保持不变；练习中修改的授权配置需手动恢复。',
    done: '练习记录已恢复，请刷新已打开的业务列表。',
  },

  teams: {
    subject: '团队',
    handover: '投标团队报价交接',
    title: '角色与团队授权',
    direct: '直接授权',
    inherited: '团队继承',
    proposal: '投标团队',
    delivery: '交付团队',
    combined: '个人项目经理 + 投标团队销售工程师',
    coverage:
      '验证菜单、操作、字段、独立范围、默认范围、用户与团队共享、限制规则及撤销授权。',
  },
  rules: {
    public: '排除保密项目',
    delivery: '向交付团队共享订单',
    projects: '共享示例项目',
  },
  accountMenus: {
    assistant: '项目、报价、订单（只读）',
    engineer: '项目、报价、订单；可提交本区域内本人编制的报价',
    manager: '管理本人负责的项目；报价、订单只读',
    delivery: '仅订单；可确认本区域订单交付',
  },
  sales: {
    saveFirst: '请先保存修改，再提交报价。',
    states: {
      draft: '草稿',
      submitted: '已提交',
      accepted: '已确认',
      ready: '待交付',
      delivered: '已交付',
    },
    errors: {
      session: '登录已失效，请重新登录。',
      input: '请检查金额及必填字段。',
      conflict: '记录状态已变化，请刷新后重试。',
      request: '请求失败，请检查网络后重试。',
    },

    operation: {
      outsideScope: '不在该操作的授权范围内',
      notReady: '仅待交付订单可以确认交付',

      allowed: '满足提交范围',
      notGranted: '只读，未授予该操作权限',
      quoteScope: '不在可提交的报价范围内',
      projectScope: '所属项目不在允许范围内',
      notDraft: '仅草稿报价可以提交',
      invalidAmount: '报价金额必须大于零',
    },
    preparedBy: '报价编制人',
    parentProject: '所属项目',
    sourceQuote: '来源报价',
    relationships: '关联信息',
    relatedQuotes: '查看项目报价',
    relatedOrders: '查看项目订单',
    filtered: '当前筛选',
    clearFilter: '清除筛选',
    noPageAccess: '无页面访问权限',
    descriptions: {
      projects:
        '查看项目，再按项目进入报价或订单。关联列表只展示当前账号有权访问的记录。',
      quotes:
        '一个项目可以有多份报价。提交时分别检查项目范围和报价编制人范围；满足范围后还须符合草稿、金额等业务条件。',
      orders:
        '订单关联来源报价和所属项目。交付账号仅能进入订单页面，关联编号不会额外授予其他菜单或记录权限。',
    },

    delivery: '交付管理',
    orders: '订单',
    editProject: '编辑项目信息',
    editQuote: '编辑报价金额',
    submit: '提交报价',
    submitScopes: {
      projects: '报价所属项目',
      quotes: '允许提交的报价',
    },
    deliver: '确认交付',
    amount: '金额',
    status: '状态',
    deliveryReference: '交付单号',

    group: '销售协作',
    title: '销售权限示例',
    projects: '项目',
    quotes: '报价',
    view: '查看',
    edit: '编辑备注',
    intro: '通过虚构数据体验功能权限、操作范围、默认访问、共享与限制规则。',
    record: '记录',
    notes: '备注',
    save: '保存',
    refresh: '刷新',
    loading: '加载中…',
    empty: '暂无可访问记录',
    readOnly: '只读',
    saved: '已保存',
    scope: {
      prepared: '本人编制的报价',
      title: '销售数据范围',
      unrestricted: '不限制',
      region: '本区域',
      own: '所属项目由本人负责',
      public: '非保密项目',
    },
  },
  title: '销售权限示例',
  overview: '使用说明',
  actions: '操作',
  testAccounts: '示例账号',
  account: '账号',
  permissionSet: '权限集',
  password: '示例密码：AuthzExample123!',
  tryTitle: '配置与验证',
  roles: {
    assistant: '销售助理',
    engineer: '销售工程师',
    manager: '项目经理',
    delivery: '交付专员',
  },
  forbidden: '没有此操作的权限。',
  error: '加载失败，请重试。',
};
