/**
 * Demo data owned by this example's staff, written into the authorization example's sales tables so the department
 * scopes, heads and sharing have records to select. Owners are demo accounts, named by email and resolved at seed
 * time. Ids carry a `dept-` prefix, which the authorization example's own rows never use.
 *
 * Every project is public: the company-wide confidentiality restriction would otherwise hide it from everyone here.
 * Each project's region is its owner's department region.
 */
export interface SeedProject {
  readonly id: string;
  readonly title: string;
  readonly region: string;
  readonly ownerEmail: string;
}

export interface SeedQuote {
  readonly id: string;
  readonly projectId: string;
  readonly preparedByEmail: string;
  readonly title: string;
  readonly amount: number;
  readonly status: 'draft' | 'accepted';
}

export interface SeedOrder {
  readonly id: string;
  readonly projectId: string;
  readonly quoteId: string;
  readonly title: string;
}

const LEO = 'leo@departments.example';
const ERIC = 'eric@departments.example';

export const SEED_PROJECTS: readonly SeedProject[] = [
  {
    id: 'dept-project-riverside',
    title: 'Riverside warehouse fit-out',
    region: 'North',
    ownerEmail: LEO,
  },
  {
    id: 'dept-project-northgate',
    title: 'Northgate showroom refresh',
    region: 'North',
    ownerEmail: LEO,
  },
  {
    id: 'dept-project-bayview',
    title: 'Bayview clinic equipment',
    region: 'South',
    ownerEmail: ERIC,
  },
  {
    id: 'dept-project-southport',
    title: 'Southport office move',
    region: 'South',
    ownerEmail: ERIC,
  },
];

export const SEED_QUOTES: readonly SeedQuote[] = [
  {
    id: 'dept-quote-riverside',
    projectId: 'dept-project-riverside',
    preparedByEmail: LEO,
    title: 'Riverside warehouse fit-out quote',
    amount: 26000,
    status: 'draft',
  },
  {
    id: 'dept-quote-bayview',
    projectId: 'dept-project-bayview',
    preparedByEmail: ERIC,
    title: 'Bayview clinic equipment quote',
    amount: 34000,
    status: 'accepted',
  },
];

/** The accepted Bayview quote has become an order; it lies in the South, where Chen's delivery work is. */
export const SEED_ORDERS: readonly SeedOrder[] = [
  {
    id: 'dept-order-bayview',
    projectId: 'dept-project-bayview',
    quoteId: 'dept-quote-bayview',
    title: 'Bayview clinic equipment order',
  },
];

/** The projects Delivery prepares: one in each region, about to close or already ordered. */
export const SHARED_WITH_DELIVERY: readonly string[] = [
  'dept-project-riverside',
  'dept-project-bayview',
];
