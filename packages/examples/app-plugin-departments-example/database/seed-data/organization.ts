import type { AuthorizationTitle } from '@nocobase/authorization/core';

import { DEPARTMENT_SUBJECT, label } from '../../server/resources.js';

export interface SeedDepartment {
  readonly id: string;
  /** A translation descriptor; the seed stores it encoded, and the client translates it. */
  readonly title: AuthorizationTitle;
  readonly parentId: string | null;
  readonly region: string | null;
  readonly sortOrder: number;
}

/** Parents before children, so every parent exists when its child is written. */
export const SEED_DEPARTMENTS: readonly SeedDepartment[] = [
  {
    id: 'trading',
    title: label('seed.trading'),
    parentId: null,
    region: null,
    sortOrder: 0,
  },
  {
    id: 'executive-office',
    title: label('seed.executiveOffice'),
    parentId: 'trading',
    region: null,
    sortOrder: 0,
  },
  {
    id: 'sales-center',
    title: label('seed.salesCenter'),
    parentId: 'trading',
    region: null,
    sortOrder: 1,
  },
  {
    id: 'north-sales',
    title: label('seed.northSales'),
    parentId: 'sales-center',
    region: 'North',
    sortOrder: 0,
  },
  {
    id: 'south-sales',
    title: label('seed.southSales'),
    parentId: 'sales-center',
    region: 'South',
    sortOrder: 1,
  },
  {
    id: 'delivery-center',
    title: label('seed.deliveryCenter'),
    parentId: 'trading',
    region: null,
    sortOrder: 2,
  },
  {
    id: 'delivery',
    title: label('seed.delivery'),
    parentId: 'delivery-center',
    region: null,
    sortOrder: 0,
  },
];

/** The authorization example's permission sets this organisation reuses. */
export const SALES_SETS = {
  assistant: 'example-sales-assistant',
  engineer: 'example-sales-engineer',
  manager: 'example-sales-manager',
  delivery: 'example-sales-delivery',
} as const;

export interface SeedAssignment {
  readonly id: string;
  readonly permissionSetKey: string;
  readonly subjectType: string;
  readonly subjectId: string;
}

/**
 * Baseline access by department. Sales Center's assistant set reaches both regional sales departments below it;
 * Delivery holds the delivery set. Job roles above the baseline are assigned to people, in {@link DEMO_ACCOUNTS}.
 */
export const DEPARTMENT_ASSIGNMENTS: readonly SeedAssignment[] = [
  {
    id: 'departments-example:sales-center:assistant',
    permissionSetKey: SALES_SETS.assistant,
    subjectType: DEPARTMENT_SUBJECT,
    subjectId: 'sales-center',
  },
  {
    id: 'departments-example:delivery:delivery',
    permissionSetKey: SALES_SETS.delivery,
    subjectType: DEPARTMENT_SUBJECT,
    subjectId: 'delivery',
  },
];

export interface SeedRuleAssignment {
  readonly id: string;
  readonly ruleId: string;
  readonly subjectId: string;
}

/**
 * The authorization example's sharing rules, assigned to departments. Sharing never grants an action: it widens
 * the records of actions a member already holds.
 */
export const SHARING_ASSIGNMENTS: readonly SeedRuleAssignment[] = [
  // Salespeople read their region's orders; delivery staff also deliver them.
  {
    id: 'departments-example:sales-center:delivery-orders',
    ruleId: 'example-delivery-orders',
    subjectId: 'sales-center',
  },
  {
    id: 'departments-example:delivery:delivery-orders',
    ruleId: 'example-delivery-orders',
    subjectId: 'delivery',
  },
  // The Executive Office reviews the shared example projects.
  {
    id: 'departments-example:executive-office:selected-projects',
    ruleId: 'example-selected-projects',
    subjectId: 'executive-office',
  },
];

/** The authorization example's confidentiality restrictions, company-wide through the root department. */
export const RESTRICTION_ASSIGNMENTS: readonly SeedRuleAssignment[] = [
  'example-public-authorizationExampleProjects',
  'example-public-authorizationExampleQuotes',
  'example-public-authorizationExampleOrders',
].map((ruleId) => ({
  id: `departments-example:trading:${ruleId}`,
  ruleId,
  subjectId: 'trading',
}));

export interface DemoMembership {
  readonly departmentId: string;
  readonly primary: boolean;
}

export interface DemoAccount {
  readonly name: string;
  readonly email: string;
  readonly memberships: readonly DemoMembership[];
  /** The person's job role, assigned to the user directly on top of what the departments pass down. */
  readonly permissionSets?: readonly string[];
}

/** Fictional accounts for practice; they share {@link DEMO_PASSWORD}. */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    name: 'Grace Zhou',
    email: 'grace@departments.example',
    memberships: [{ departmentId: 'executive-office', primary: true }],
    permissionSets: [SALES_SETS.manager],
  },
  {
    name: 'Leo Wang',
    email: 'leo@departments.example',
    memberships: [{ departmentId: 'north-sales', primary: true }],
    permissionSets: [SALES_SETS.engineer],
  },
  {
    name: 'Nina Li',
    email: 'nina@departments.example',
    memberships: [{ departmentId: 'north-sales', primary: true }],
  },
  {
    name: 'Chen Chen',
    email: 'chen@departments.example',
    memberships: [
      { departmentId: 'south-sales', primary: true },
      { departmentId: 'delivery', primary: false },
    ],
  },
  {
    name: 'Eric Liu',
    email: 'eric@departments.example',
    memberships: [{ departmentId: 'south-sales', primary: true }],
    permissionSets: [SALES_SETS.engineer],
  },
  {
    name: 'Mia Zhao',
    email: 'mia@departments.example',
    memberships: [{ departmentId: 'delivery', primary: true }],
  },
];

export const DEMO_PASSWORD = 'departments-demo';

/** The region the organisation gives an account at seed time: its primary regional department's, else another's. */
export function seedRegionOf(account: DemoAccount): string | null {
  const regions = [...account.memberships]
    .sort((left, right) => Number(right.primary) - Number(left.primary))
    .map(
      (membership) =>
        SEED_DEPARTMENTS.find((item) => item.id === membership.departmentId)
          ?.region ?? null,
    )
    .filter((region): region is string => region !== null);
  return regions[0] ?? null;
}
