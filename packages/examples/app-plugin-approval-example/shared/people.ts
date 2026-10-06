/**
 * The example's people: personas the pages switch between so one person can
 * try every role. They are not user accounts; a real application takes the
 * actor from the signed-in user and its own directory.
 */
/** A department of the demo organization, for grouping people. */
export type Department =
  | 'marketing'
  | 'management'
  | 'hr'
  | 'finance'
  | 'legal'
  | 'committee'
  | 'it'
  | 'operations'
  | 'risk'
  | 'procurement'
  | 'external'
  | 'system';

export interface PersonProfile {
  readonly id: string;
  readonly name: { readonly zh: string; readonly en: string };
  readonly title: { readonly zh: string; readonly en: string };
  readonly department: Department;
}

function profile(
  id: string,
  zh: string,
  en: string,
  titleZh: string,
  titleEn: string,
  department: Department,
): PersonProfile {
  return {
    id,
    name: { zh, en },
    title: { zh: titleZh, en: titleEn },
    department,
  };
}

/** Display names of the example identities the scenarios resolve against. */
export const PEOPLE: readonly PersonProfile[] = [
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
  profile('buyerA', '唐宁', 'Tang Ning', '采购专员', 'Buyer', 'procurement'),
  profile('buyerB', '宋雨', 'Song Yu', '采购专员', 'Buyer', 'procurement'),
  profile(
    'admin',
    '管理员',
    'Administrator',
    '审批管理员',
    'Approval administrator',
    'system',
  ),
];

const PROFILES: ReadonlyMap<string, PersonProfile> = new Map(
  PEOPLE.map((person) => [person.id, person]),
);

export function profileOf(id: string): PersonProfile | undefined {
  return PROFILES.get(id);
}

/** The name in `language`, or the id itself for someone not in the directory. */
export function personName(id: string, language: string): string {
  const person = PROFILES.get(id);
  if (!person) return id;
  return language.startsWith('zh') ? person.name.zh : person.name.en;
}

export function personTitle(id: string, language: string): string {
  const person = PROFILES.get(id);
  if (!person) return '';
  return language.startsWith('zh') ? person.title.zh : person.title.en;
}
