export type CrmChoice = {
  value: string;
  label: string;
  tone: 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'purple';
};

export type CrmRelationConfig = {
  resource: string;
  relationName: string;
  labelField: string;
  secondaryField?: string;
};

export type CrmFieldConfig = {
  name: string;
  label: string;
  kind:
    | 'text'
    | 'email'
    | 'phone'
    | 'url'
    | 'number'
    | 'percent'
    | 'date'
    | 'datetime'
    | 'textarea'
    | 'select'
    | 'relation';
  placeholder?: string;
  required?: boolean;
  form?: boolean;
  list?: boolean;
  detail?: boolean;
  options?: CrmChoice[];
  relation?: CrmRelationConfig;
};

export type CrmResourceConfig = {
  resource: string;
  route: string;
  title: string;
  singular: string;
  description: string;
  primaryField: string;
  searchField: string;
  statusField?: string;
  defaultValues?: Record<string, unknown>;
  fields: CrmFieldConfig[];
};

const accountStatus: CrmChoice[] = [
  { value: 'prospect', label: '潜在客户', tone: 'blue' },
  { value: 'active', label: '合作中', tone: 'green' },
  { value: 'paused', label: '暂缓', tone: 'amber' },
  { value: 'inactive', label: '已流失', tone: 'neutral' },
];

const accountTier: CrmChoice[] = [
  { value: 'strategic', label: '战略客户', tone: 'purple' },
  { value: 'key', label: '重点客户', tone: 'blue' },
  { value: 'standard', label: '普通客户', tone: 'neutral' },
];

const leadStatus: CrmChoice[] = [
  { value: 'new', label: '待联系', tone: 'blue' },
  { value: 'contacted', label: '已联系', tone: 'purple' },
  { value: 'qualified', label: '已确认', tone: 'green' },
  { value: 'nurturing', label: '持续培育', tone: 'amber' },
  { value: 'disqualified', label: '无效线索', tone: 'neutral' },
];

const leadSource: CrmChoice[] = [
  { value: 'inbound', label: '官网咨询', tone: 'blue' },
  { value: 'referral', label: '客户转介绍', tone: 'green' },
  { value: 'event', label: '市场活动', tone: 'purple' },
  { value: 'outbound', label: '主动拓展', tone: 'amber' },
  { value: 'partner', label: '合作伙伴', tone: 'neutral' },
];

export const opportunityStages: CrmChoice[] = [
  { value: 'discovery', label: '需求发现', tone: 'blue' },
  { value: 'proposal', label: '方案报价', tone: 'purple' },
  { value: 'negotiation', label: '商务谈判', tone: 'amber' },
  { value: 'won', label: '赢单', tone: 'green' },
  { value: 'lost', label: '输单', tone: 'red' },
];

const contactRole: CrmChoice[] = [
  { value: 'decision_maker', label: '决策人', tone: 'purple' },
  { value: 'champion', label: '内部支持者', tone: 'green' },
  { value: 'influencer', label: '影响者', tone: 'blue' },
  { value: 'user', label: '业务使用者', tone: 'neutral' },
];

const activityType: CrmChoice[] = [
  { value: 'call', label: '电话', tone: 'blue' },
  { value: 'meeting', label: '会议', tone: 'purple' },
  { value: 'email', label: '邮件', tone: 'green' },
  { value: 'task', label: '任务', tone: 'amber' },
];

const activityStatus: CrmChoice[] = [
  { value: 'planned', label: '待处理', tone: 'blue' },
  { value: 'completed', label: '已完成', tone: 'green' },
  { value: 'cancelled', label: '已取消', tone: 'neutral' },
];

export const crmResources: Record<string, CrmResourceConfig> = {
  agent_crm_accounts: {
    resource: 'agent_crm_accounts',
    route: '/accounts',
    title: '客户档案',
    singular: '客户',
    description: '维护客户分层、行业画像和合作状态。',
    primaryField: 'name',
    searchField: 'name',
    statusField: 'status',
    defaultValues: { status: 'prospect', tier: 'standard' },
    fields: [
      {
        name: 'name',
        label: '客户名称',
        kind: 'text',
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'industry',
        label: '所属行业',
        kind: 'text',
        list: true,
        detail: true,
      },
      {
        name: 'tier',
        label: '客户分层',
        kind: 'select',
        options: accountTier,
        list: true,
        detail: true,
      },
      {
        name: 'status',
        label: '合作状态',
        kind: 'select',
        options: accountStatus,
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'region',
        label: '所在区域',
        kind: 'text',
        list: true,
        detail: true,
      },
      { name: 'website', label: '官方网站', kind: 'url', detail: true },
      { name: 'phone', label: '企业电话', kind: 'phone', detail: true },
      { name: 'notes', label: '客户备注', kind: 'textarea', detail: true },
    ],
  },
  agent_crm_contacts: {
    resource: 'agent_crm_contacts',
    route: '/contacts',
    title: '联系人',
    singular: '联系人',
    description: '记录关键联系人、决策角色和沟通方式。',
    primaryField: 'name',
    searchField: 'name',
    fields: [
      {
        name: 'name',
        label: '姓名',
        kind: 'text',
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'jobTitle',
        label: '职位',
        kind: 'text',
        list: true,
        detail: true,
      },
      {
        name: 'decisionRole',
        label: '决策角色',
        kind: 'select',
        options: contactRole,
        list: true,
        detail: true,
      },
      {
        name: 'accountId',
        label: '所属客户',
        kind: 'relation',
        required: true,
        list: true,
        detail: true,
        relation: {
          resource: 'agent_crm_accounts',
          relationName: 'account',
          labelField: 'name',
          secondaryField: 'industry',
        },
      },
      { name: 'email', label: '邮箱', kind: 'email', list: true, detail: true },
      { name: 'phone', label: '手机', kind: 'phone', detail: true },
      { name: 'notes', label: '沟通偏好', kind: 'textarea', detail: true },
    ],
  },
  agent_crm_leads: {
    resource: 'agent_crm_leads',
    route: '/leads',
    title: '销售线索',
    singular: '线索',
    description: '集中处理新线索、资格判断和下一步动作。',
    primaryField: 'name',
    searchField: 'name',
    statusField: 'status',
    defaultValues: { status: 'new', source: 'inbound', score: 50 },
    fields: [
      {
        name: 'code',
        label: '线索编号',
        kind: 'text',
        form: false,
        list: true,
        detail: true,
      },
      {
        name: 'name',
        label: '联系人',
        kind: 'text',
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'company',
        label: '公司',
        kind: 'text',
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'status',
        label: '线索状态',
        kind: 'select',
        options: leadStatus,
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'source',
        label: '来源',
        kind: 'select',
        options: leadSource,
        list: true,
        detail: true,
      },
      {
        name: 'score',
        label: '线索评分',
        kind: 'number',
        list: true,
        detail: true,
      },
      { name: 'email', label: '邮箱', kind: 'email', list: true, detail: true },
      { name: 'phone', label: '手机', kind: 'phone', detail: true },
      {
        name: 'ownerId',
        label: '负责人',
        kind: 'relation',
        list: true,
        detail: true,
        relation: {
          resource: 'user',
          relationName: 'owner',
          labelField: 'name',
          secondaryField: 'email',
        },
      },
      { name: 'notes', label: '需求摘要', kind: 'textarea', detail: true },
    ],
  },
  agent_crm_opportunities: {
    resource: 'agent_crm_opportunities',
    route: '/opportunities',
    title: '商机管道',
    singular: '商机',
    description: '跟踪阶段、金额、赢率和预计成交日期。',
    primaryField: 'name',
    searchField: 'name',
    statusField: 'stage',
    defaultValues: { stage: 'discovery', probability: 20 },
    fields: [
      {
        name: 'name',
        label: '商机名称',
        kind: 'text',
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'accountId',
        label: '客户',
        kind: 'relation',
        required: true,
        list: true,
        detail: true,
        relation: {
          resource: 'agent_crm_accounts',
          relationName: 'account',
          labelField: 'name',
          secondaryField: 'industry',
        },
      },
      {
        name: 'stage',
        label: '销售阶段',
        kind: 'select',
        options: opportunityStages,
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'amount',
        label: '预计金额',
        kind: 'number',
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'probability',
        label: '赢率',
        kind: 'percent',
        list: true,
        detail: true,
      },
      {
        name: 'expectedCloseDate',
        label: '预计成交',
        kind: 'date',
        list: true,
        detail: true,
      },
      {
        name: 'nextStep',
        label: '下一步',
        kind: 'text',
        list: true,
        detail: true,
      },
      {
        name: 'ownerId',
        label: '负责人',
        kind: 'relation',
        list: true,
        detail: true,
        relation: {
          resource: 'user',
          relationName: 'owner',
          labelField: 'name',
          secondaryField: 'email',
        },
      },
      { name: 'notes', label: '商机备注', kind: 'textarea', detail: true },
    ],
  },
  agent_crm_activities: {
    resource: 'agent_crm_activities',
    route: '/activities',
    title: '跟进任务',
    singular: '跟进任务',
    description: '安排电话、会议、邮件与后续行动。',
    primaryField: 'subject',
    searchField: 'subject',
    statusField: 'status',
    defaultValues: { type: 'task', status: 'planned' },
    fields: [
      {
        name: 'subject',
        label: '主题',
        kind: 'text',
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'type',
        label: '跟进类型',
        kind: 'select',
        options: activityType,
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'status',
        label: '处理状态',
        kind: 'select',
        options: activityStatus,
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'dueAt',
        label: '计划时间',
        kind: 'datetime',
        required: true,
        list: true,
        detail: true,
      },
      {
        name: 'opportunityId',
        label: '关联商机',
        kind: 'relation',
        list: true,
        detail: true,
        relation: {
          resource: 'agent_crm_opportunities',
          relationName: 'opportunity',
          labelField: 'name',
          secondaryField: 'stage',
        },
      },
      {
        name: 'contactId',
        label: '关联联系人',
        kind: 'relation',
        detail: true,
        relation: {
          resource: 'agent_crm_contacts',
          relationName: 'contact',
          labelField: 'name',
          secondaryField: 'jobTitle',
        },
      },
      { name: 'notes', label: '跟进记录', kind: 'textarea', detail: true },
    ],
  },
};

export const getCrmResource = (resource?: string) => {
  if (!resource) return undefined;
  if (crmResources[resource]) return crmResources[resource];

  // Refine can expose a child route as `resource.action` (for example
  // `agent_crm_leads.show.edit`). Resolve that route back to its owning CRM
  // collection so URL-backed drawers keep the same page configuration.
  return Object.values(crmResources).find((config) =>
    resource.startsWith(`${config.resource}.`),
  );
};

export const getCrmResourceFromPathname = (pathname: string) => {
  const normalizedPath = `/${pathname.replace(/^\/+|\/+$/g, '')}/`;
  return Object.values(crmResources).find((config) =>
    normalizedPath.includes(`${config.route}/`),
  );
};

export const getResourceAppends = (config: CrmResourceConfig) =>
  config.fields.flatMap((field) =>
    field.relation ? [field.relation.relationName] : [],
  );

export const getChoice = (field: CrmFieldConfig, value: unknown) =>
  field.options?.find((option) => option.value === value);
