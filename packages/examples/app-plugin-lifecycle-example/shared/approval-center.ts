import type { JsonObject, JsonValue } from '@nocobase/lifecycle';

/**
 * The approval center shows the approval scenarios as business applications.
 * Everything here is shared by the server, which classifies and summarizes
 * records, and the client, which renders them.
 */

/** A department of the demo organization, for grouping people. */
export type CenterDepartment =
  | 'marketing'
  | 'management'
  | 'hr'
  | 'finance'
  | 'legal'
  | 'committee'
  | 'it'
  | 'operations'
  | 'risk'
  | 'external'
  | 'system';

export interface CenterPersonProfile {
  readonly id: string;
  readonly name: { readonly zh: string; readonly en: string };
  readonly title: { readonly zh: string; readonly en: string };
  readonly department: CenterDepartment;
}

function profile(
  id: string,
  zh: string,
  en: string,
  titleZh: string,
  titleEn: string,
  department: CenterDepartment,
): CenterPersonProfile {
  return {
    id,
    name: { zh, en },
    title: { zh: titleZh, en: titleEn },
    department,
  };
}

/** Display names of the example identities the scenarios resolve against. */
export const CENTER_PEOPLE: readonly CenterPersonProfile[] = [
  profile(
    'zhang',
    '张三',
    'Zhang San',
    '市场专员',
    'Marketing specialist',
    'marketing',
  ),
  profile(
    'assistant',
    '吕晴',
    'Lyu Qing',
    '市场部助理',
    'Marketing assistant',
    'marketing',
  ),
  profile(
    'li',
    '李四',
    'Li Si',
    '市场部经理',
    'Marketing manager',
    'marketing',
  ),
  profile('zhao', '赵敏', 'Zhao Min', '品牌主管', 'Brand lead', 'marketing'),
  profile(
    'wang',
    '王五',
    'Wang Wu',
    '市场总监',
    'Marketing director',
    'management',
  ),
  profile('vp', '陈立', 'Chen Li', '副总裁', 'Vice president', 'management'),
  profile(
    'ceo',
    '刘洋',
    'Liu Yang',
    '首席执行官',
    'Chief executive',
    'management',
  ),
  profile('hr', '周敏', 'Zhou Min', '人事经理', 'HR manager', 'hr'),
  profile('hrA', '陶然', 'Tao Ran', '人事专员', 'HR specialist', 'hr'),
  profile('finA', '钱程', 'Qian Cheng', '财务会计', 'Accountant', 'finance'),
  profile('finB', '孙悦', 'Sun Yue', '出纳', 'Treasurer', 'finance'),
  profile('finC', '吴迪', 'Wu Di', '财务会计', 'Accountant', 'finance'),
  profile(
    'sup',
    '何静',
    'He Jing',
    '财务共享中心主管',
    'Shared finance supervisor',
    'finance',
  ),
  profile('legalA', '郑直', 'Zheng Zhi', '法务专员', 'Legal counsel', 'legal'),
  profile('legalB', '冯清', 'Feng Qing', '法务专员', 'Legal counsel', 'legal'),
  profile('legalC', '褚明', 'Chu Ming', '法务专员', 'Legal counsel', 'legal'),
  profile(
    'legalLead',
    '卫东',
    'Wei Dong',
    '法务总监',
    'Head of legal',
    'legal',
  ),
  profile(
    'lawyer',
    '蒋律师',
    'Counsel Jiang',
    '外部律师',
    'External counsel',
    'external',
  ),
  profile(
    'm1',
    '沈一鸣',
    'Shen Yiming',
    '投资委员会委员',
    'Committee member',
    'committee',
  ),
  profile(
    'm2',
    '韩冰',
    'Han Bing',
    '投资委员会委员',
    'Committee member',
    'committee',
  ),
  profile(
    'm3',
    '杨帆',
    'Yang Fan',
    '投资委员会委员',
    'Committee member',
    'committee',
  ),
  profile(
    'm4',
    '朱琳',
    'Zhu Lin',
    '投资委员会委员',
    'Committee member',
    'committee',
  ),
  profile(
    'm5',
    '秦岭',
    'Qin Ling',
    '投资委员会主席',
    'Committee chair',
    'committee',
  ),
  profile('itA', '施展', 'Shi Zhan', 'IT 采购负责人', 'IT procurement', 'it'),
  profile('itOpsA', '金石', 'Jin Shi', 'IT 运维', 'IT operations', 'it'),
  profile('secA', '曹安', 'Cao An', '安全专员', 'Security analyst', 'it'),
  profile('secEng', '严谨', 'Yan Jin', '安全工程师', 'Security engineer', 'it'),
  profile('secLead', '华盾', 'Hua Dun', '安全负责人', 'Head of security', 'it'),
  profile(
    'facA',
    '孔雀',
    'Kong Que',
    '行政主管',
    'Facilities lead',
    'operations',
  ),
  profile(
    'facOpsA',
    '魏然',
    'Wei Ran',
    '行政专员',
    'Facilities specialist',
    'operations',
  ),
  profile(
    'opsA',
    '许航',
    'Xu Hang',
    '运营经理',
    'Operations manager',
    'operations',
  ),
  profile('riskA', '姜衡', 'Jiang Heng', '风控专员', 'Risk analyst', 'risk'),
  profile('riskLead', '戚远', 'Qi Yuan', '风控负责人', 'Head of risk', 'risk'),
  profile(
    'admin',
    '管理员',
    'Administrator',
    '审批管理员',
    'Approval administrator',
    'system',
  ),
];

const PROFILES: ReadonlyMap<string, CenterPersonProfile> = new Map(
  CENTER_PEOPLE.map((person) => [person.id, person]),
);

export function centerProfile(id: string): CenterPersonProfile | undefined {
  return PROFILES.get(id);
}

/** The name in `language`, or the id itself for someone not in the directory. */
export function centerName(id: string, language: string): string {
  const person = PROFILES.get(id);
  if (!person) return id;
  return language.startsWith('zh') ? person.name.zh : person.name.en;
}

export function centerTitle(id: string, language: string): string {
  const person = PROFILES.get(id);
  if (!person) return '';
  return language.startsWith('zh') ? person.title.zh : person.title.en;
}

/** The business applications of the center, in menu order. */
export type CenterBusinessKey =
  | 'leave'
  | 'travel'
  | 'purchase'
  | 'contract'
  | 'reimbursement'
  | 'payment'
  | 'grant'
  | 'supplier'
  | 'onboarding'
  | 'launch'
  | 'notice';

export interface CenterCastMember {
  readonly id: string;
  /** A key under `center.cast`: what this person does in the business. */
  readonly role: string;
}

export interface CenterBusiness {
  readonly key: CenterBusinessKey;
  readonly path: string;
  /** Approval demo keys a person can start here, the first being the default. */
  readonly types: readonly string[];
  /** Who to switch to while trying the business, in the order they act. */
  readonly cast: readonly CenterCastMember[];
}

export const CENTER_BUSINESSES: readonly CenterBusiness[] = [
  {
    key: 'leave',
    path: '/approval-center/leave',
    types: ['leaveTiered'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'li', role: 'manager' },
      { id: 'wang', role: 'departmentHead' },
      { id: 'hr', role: 'hr' },
    ],
  },
  {
    key: 'travel',
    path: '/approval-center/travel',
    types: ['travel'],
    cast: [
      { id: 'zhang', role: 'traveller' },
      { id: 'assistant', role: 'proxy' },
      { id: 'li', role: 'manager' },
    ],
  },
  {
    key: 'purchase',
    path: '/approval-center/purchase',
    types: ['purchaseChain', 'purchase', 'committee'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'li', role: 'manager' },
      { id: 'wang', role: 'departmentHead' },
      { id: 'vp', role: 'vp' },
      { id: 'ceo', role: 'ceo' },
      { id: 'itA', role: 'itReview' },
      { id: 'facA', role: 'facilitiesReview' },
      { id: 'm1', role: 'committeeMember' },
      { id: 'm5', role: 'committeeChair' },
    ],
  },
  {
    key: 'contract',
    path: '/approval-center/contracts',
    types: ['contract', 'contractCountersign', 'legalReview', 'consulted'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'li', role: 'manager' },
      { id: 'legalA', role: 'legal' },
      { id: 'legalB', role: 'legal' },
      { id: 'legalLead', role: 'legalLead' },
      { id: 'lawyer', role: 'counsel' },
      { id: 'finA', role: 'finance' },
      { id: 'ceo', role: 'ceo' },
      { id: 'wang', role: 'copied' },
    ],
  },
  {
    key: 'reimbursement',
    path: '/approval-center/reimbursements',
    types: ['reimbursement'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'finA', role: 'travelReview' },
      { id: 'facA', role: 'hotelReview' },
    ],
  },
  {
    key: 'payment',
    path: '/approval-center/payments',
    types: ['payment', 'financePool'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'finA', role: 'financeApprover' },
      { id: 'finB', role: 'treasurer' },
      { id: 'finC', role: 'finance' },
      { id: 'sup', role: 'poolSupervisor' },
    ],
  },
  {
    key: 'grant',
    path: '/approval-center/grants',
    types: ['authorization'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'li', role: 'contractApprover' },
      { id: 'finA', role: 'grantAuthority' },
    ],
  },
  {
    key: 'supplier',
    path: '/approval-center/suppliers',
    types: ['supplier'],
    cast: [
      { id: 'zhang', role: 'supplierContact' },
      { id: 'legalA', role: 'legal' },
      { id: 'riskA', role: 'risk' },
      { id: 'riskLead', role: 'riskLead' },
      { id: 'opsA', role: 'supplierOps' },
      { id: 'admin', role: 'admin' },
    ],
  },
  {
    key: 'onboarding',
    path: '/approval-center/onboarding',
    types: ['onboarding'],
    cast: [
      { id: 'zhang', role: 'hiringManager' },
      { id: 'itOpsA', role: 'itOps' },
      { id: 'facOpsA', role: 'facOps' },
      { id: 'hrA', role: 'hrOps' },
    ],
  },
  {
    key: 'launch',
    path: '/approval-center/launches',
    types: ['launch'],
    cast: [
      { id: 'zhang', role: 'productOwner' },
      { id: 'secEng', role: 'security' },
      { id: 'secLead', role: 'securityLead' },
      { id: 'legalA', role: 'legal' },
      { id: 'legalLead', role: 'legalLead' },
      { id: 'finA', role: 'finance' },
      { id: 'opsA', role: 'operations' },
    ],
  },
  {
    key: 'notice',
    path: '/approval-center/notices',
    types: ['notice'],
    cast: [
      { id: 'zhang', role: 'publisher' },
      { id: 'li', role: 'recipient' },
      { id: 'wang', role: 'recipient' },
    ],
  },
];

export function centerBusiness(key: string): CenterBusiness | undefined {
  return CENTER_BUSINESSES.find((business) => business.key === key);
}

const KIND_BUSINESS: Readonly<Record<string, CenterBusinessKey>> = {
  leaveTiered: 'leave',
  leaveVersioned: 'leave',
  leaveAtSubmit: 'leave',
  travel: 'travel',
  purchaseChain: 'purchase',
  committee: 'purchase',
  itReview: 'purchase',
  facilitiesReview: 'purchase',
  contract: 'contract',
  contractCountersign: 'contract',
  contractFullReview: 'contract',
  legalReview: 'contract',
  consulted: 'contract',
  contractMatter: 'contract',
  financeFirst: 'payment',
  financeAny: 'payment',
  financeSingle: 'payment',
  financePool: 'payment',
  launchSecurity: 'launch',
  launchLegal: 'launch',
  launchFinance: 'launch',
  purchase: 'purchase',
  launch: 'launch',
  onboarding: 'onboarding',
};

const LIFECYCLE_BUSINESS: Readonly<Record<string, CenterBusinessKey>> = {
  leaveRequests: 'leave',
  supplierOnboardings: 'supplier',
  reimbursements: 'reimbursement',
  paymentRequests: 'payment',
  authorizationRequests: 'grant',
  budgetGrants: 'grant',
  notices: 'notice',
};

/**
 * The business a record belongs to, from its lifecycle and kind. Children
 * and copies have none of their own and take their parent's or source's,
 * which the caller resolves.
 */
export function businessOfKind(
  lifecycle: string,
  kind: string | null,
): CenterBusinessKey | null {
  return (
    LIFECYCLE_BUSINESS[lifecycle] ??
    (kind === null ? null : (KIND_BUSINESS[kind] ?? null))
  );
}

/** One record as the lists and the to-do center show it. */
export interface CenterRecord {
  readonly lifecycle: string;
  readonly id: string;
  readonly business: CenterBusinessKey | null;
  /** The approval demo key or the request kind; null for records without one. */
  readonly kind: string | null;
  readonly title: string;
  readonly status: string;
  readonly applicantId: string;
  readonly parent: { readonly lifecycle: string; readonly id: string } | null;
  readonly createdAt: string | null;
  readonly updatedAt: string;
  /** Who the record is waiting for now. */
  readonly handlers: readonly string[];
  /** The current step's key, such as a stage key; null when nothing is waiting. */
  readonly step: string | null;
  /** The business facts a list row shows, such as days or an amount. */
  readonly facts: JsonObject;
}

export type CenterBox = 'toDo' | 'done' | 'mine' | 'copiedToMe';

/** One entry of the to-do center. */
export interface CenterInboxItem {
  readonly box: CenterBox;
  readonly lifecycle: string;
  readonly recordId: string;
  /** What the person would do: a transition name, or null to only look. */
  readonly action: string | null;
  /** A detail of the task, such as the question asked. */
  readonly detail: string;
  readonly since: string;
  /** Whom the person acts for under a delegation. */
  readonly onBehalfOf: string | null;
}

export interface CenterOverview {
  readonly records: readonly CenterRecord[];
  readonly inbox: readonly CenterInboxItem[];
  readonly people: readonly {
    readonly id: string;
    readonly roles: readonly string[];
    readonly manager: string | null;
  }[];
}

/** One step of a preview: who would decide, and how. */
export interface CenterPreviewStep {
  readonly key: string;
  readonly title: string;
  readonly kind: 'approval' | 'work' | 'review';
  readonly people: readonly string[];
  readonly rule: JsonValue;
  readonly required: boolean;
  readonly notes: readonly string[];
}

export interface CenterPreview {
  /** Sequential steps, or the parallel branches of a coordinated request. */
  readonly mode: 'sequential' | 'parallel';
  readonly steps: readonly CenterPreviewStep[];
  readonly problems: readonly string[];
}
