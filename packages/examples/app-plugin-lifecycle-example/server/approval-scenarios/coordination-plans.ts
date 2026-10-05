import type { JsonObject, JsonValue } from '@nocobase/lifecycle';

import type {
  BranchSpec,
  CoordinationPlan,
  CoordinationPlanner,
  CoordinationStrategy,
  WorkSpec,
} from './coordination.js';

// The business rules of the three coordinated scenarios: which branches a
// request's content needs. They are code; what they produce is copied onto
// the request when it starts.

/** Which department reviews a purchase category, and under which approval policy. */
export interface DepartmentReview {
  readonly department: string;
  readonly title: string;
  readonly approvalKind: string;
  /** Defaults to true. */
  readonly required?: boolean;
}

export interface PurchaseItem {
  readonly category: string;
  readonly name: string;
  readonly amount: number;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function purchaseItems(content: JsonObject): PurchaseItem[] {
  const items = Array.isArray(content.items) ? content.items : [];
  return items.flatMap((item) =>
    isObject(item) && typeof item.category === 'string'
      ? [
          {
            category: item.category,
            name: typeof item.name === 'string' ? item.name : item.category,
            amount: typeof item.amount === 'number' ? item.amount : 0,
          },
        ]
      : [],
  );
}

export const PURCHASE_STRATEGY: CoordinationStrategy = Object.freeze({
  rule: { kind: 'all' } as const,
  onBranchFailure: 'fail',
  onFailure: 'cancelOpen',
  compensate: false,
});

/**
 * Scenario 9: each department whose categories the items touch reviews its
 * own items, under its own approval policy. A category nobody reviews makes
 * the request unplannable rather than letting it through unreviewed;
 * categories listed as `exempt` need no review. `categories` is read on every
 * plan, so a new category applies to requests started afterwards.
 */
export function purchasePlanner(
  categories: ReadonlyMap<string, DepartmentReview>,
  exempt: ReadonlySet<string> = new Set(),
): CoordinationPlanner {
  return {
    title: 'Purchase',
    strategy: PURCHASE_STRATEGY,
    plan: (content): CoordinationPlan => {
      const byDepartment = new Map<
        string,
        { review: DepartmentReview; items: PurchaseItem[] }
      >();
      const problems: string[] = [];
      const notes: string[] = [];
      for (const item of purchaseItems(content)) {
        const review = categories.get(item.category);
        if (!review) {
          if (exempt.has(item.category))
            notes.push(
              `${item.name} (${item.category}) needs no department review.`,
            );
          else
            problems.push(
              `No department reviews the category "${item.category}".`,
            );
          continue;
        }
        const entry = byDepartment.get(review.department) ?? {
          review,
          items: [],
        };
        entry.items.push(item);
        byDepartment.set(review.department, entry);
      }
      const branches: BranchSpec[] = [...byDepartment.values()].map(
        ({ review, items }) => ({
          key: review.department,
          title: review.title,
          kind: 'approval',
          required: review.required ?? true,
          approvalKind: review.approvalKind,
          content: {
            department: review.department,
            items: items.map((item) => ({
              category: item.category,
              name: item.name,
              amount: item.amount,
            })),
            amount: items.reduce((sum, item) => sum + item.amount, 0),
          },
          because: `Items ${items.map((item) => item.category).join(', ')} are reviewed by ${review.title}.`,
        }),
      );
      return { branches, problems, notes };
    },
  };
}

export const LAUNCH_STRATEGY: CoordinationStrategy = Object.freeze({
  rule: { kind: 'all' } as const,
  onBranchFailure: 'fail',
  onFailure: 'cancelOpen',
  compensate: true,
});

export const OPS_PREPARATION: WorkSpec = Object.freeze({
  definition: 'launchPreparation@v1',
  ownerRole: 'ops',
  steps: [
    { key: 'provisionServers', title: 'Provision servers' },
    { key: 'configureMonitoring', title: 'Configure monitoring' },
  ],
});

/**
 * Scenario 10: security, legal and finance each review the launch under
 * their own multi-stage policy, and operations prepares it. The preparation
 * is work, not an opinion: it is required, but it approves nothing.
 */
export function launchPlanner(): CoordinationPlanner {
  return {
    title: 'Product launch',
    strategy: LAUNCH_STRATEGY,
    plan: (content): CoordinationPlan => ({
      branches: [
        {
          key: 'security',
          title: 'Security review',
          kind: 'approval',
          required: true,
          approvalKind: 'launchSecurity',
          content,
          because: 'Every launch.',
        },
        {
          key: 'legal',
          title: 'Legal review',
          kind: 'approval',
          required: true,
          approvalKind: 'launchLegal',
          content,
          because: 'Every launch.',
        },
        {
          key: 'finance',
          title: 'Finance review',
          kind: 'approval',
          required: true,
          approvalKind: 'launchFinance',
          content,
          because: 'Every launch.',
        },
        {
          key: 'ops',
          title: 'Operations preparation',
          kind: 'preparation',
          required: true,
          work: OPS_PREPARATION,
          because: 'Every launch needs servers.',
        },
      ],
      problems: [],
      notes: [],
    }),
  };
}

/** The current version of each onboarding sub-process; replacing one affects only new hires. */
export interface OnboardingDefinitions {
  it: WorkSpec;
  admin: WorkSpec;
  hr: WorkSpec;
}

export const ONBOARDING_STRATEGY: CoordinationStrategy = Object.freeze({
  rule: { kind: 'all' } as const,
  // A failed step waits for its team to retry it: onboarding does not fail
  // because a laptop order timed out.
  onBranchFailure: 'wait',
  onFailure: 'cancelOpen',
  compensate: true,
});

/**
 * Scenario 19: IT, administration and HR each run their own sub-process.
 * A remote hire needs no desk, so the administration branch is optional for
 * them: it still runs, but onboarding does not wait for it.
 */
export function onboardingPlanner(
  definitions: OnboardingDefinitions,
): CoordinationPlanner {
  return {
    title: 'Onboarding',
    strategy: ONBOARDING_STRATEGY,
    plan: (content): CoordinationPlan => {
      const remote = content.remote === true;
      return {
        branches: [
          {
            key: 'it',
            title: 'IT onboarding',
            kind: 'subprocess',
            required: true,
            work: definitions.it,
          },
          {
            key: 'admin',
            title: 'Administration onboarding',
            kind: 'subprocess',
            required: !remote,
            work: definitions.admin,
            because: remote
              ? 'Remote hire: a desk is not a condition.'
              : 'On-site hire.',
          },
          {
            key: 'hr',
            title: 'HR onboarding',
            kind: 'subprocess',
            required: true,
            work: definitions.hr,
          },
        ],
        problems: [],
        notes: [],
      };
    },
  };
}
