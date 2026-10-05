import {
  BadgeCheck,
  Building2,
  CalendarDays,
  FileSignature,
  HandCoins,
  Inbox,
  Megaphone,
  Plane,
  Receipt,
  RefreshCcw,
  Rocket,
  ShoppingCart,
  Stamp,
  Ticket,
  UserPlus,
  Wallet,
} from 'lucide-react';
import type { ReactElement } from 'react';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
  type AppClientSettingIcon,
} from '@nocobase/app-client/plugins';

type CenterPage =
  | 'LeavePage'
  | 'TravelPage'
  | 'PurchasePage'
  | 'ContractPage'
  | 'ReimbursementPage'
  | 'PaymentPage'
  | 'GrantPage'
  | 'SupplierPage'
  | 'OnboardingPage'
  | 'LaunchPage'
  | 'NoticePage'
  | 'InboxPage';

/** Every approval center page comes from one module; each route takes its own export. */
const centerPage =
  (page: CenterPage) => async (): Promise<{ default: () => ReactElement }> => {
    const pages = await import('./approval-center/pages.js');
    return { default: pages[page] };
  };

const CENTER_ROUTES: readonly {
  readonly key: string;
  readonly path: string;
  readonly page: CenterPage;
  readonly icon: AppClientSettingIcon;
}[] = [
  {
    key: 'inbox',
    path: '/approval-center/inbox',
    page: 'InboxPage',
    icon: Inbox,
  },
  {
    key: 'leave',
    path: '/approval-center/leave',
    page: 'LeavePage',
    icon: CalendarDays,
  },
  {
    key: 'travel',
    path: '/approval-center/travel',
    page: 'TravelPage',
    icon: Plane,
  },
  {
    key: 'purchase',
    path: '/approval-center/purchase',
    page: 'PurchasePage',
    icon: ShoppingCart,
  },
  {
    key: 'contract',
    path: '/approval-center/contracts',
    page: 'ContractPage',
    icon: FileSignature,
  },
  {
    key: 'reimbursement',
    path: '/approval-center/reimbursements',
    page: 'ReimbursementPage',
    icon: Receipt,
  },
  {
    key: 'payment',
    path: '/approval-center/payments',
    page: 'PaymentPage',
    icon: Wallet,
  },
  {
    key: 'grant',
    path: '/approval-center/grants',
    page: 'GrantPage',
    icon: HandCoins,
  },
  {
    key: 'supplier',
    path: '/approval-center/suppliers',
    page: 'SupplierPage',
    icon: Building2,
  },
  {
    key: 'onboarding',
    path: '/approval-center/onboarding',
    page: 'OnboardingPage',
    icon: UserPlus,
  },
  {
    key: 'launch',
    path: '/approval-center/launches',
    page: 'LaunchPage',
    icon: Rocket,
  },
  {
    key: 'notice',
    path: '/approval-center/notices',
    page: 'NoticePage',
    icon: Megaphone,
  },
];

const routes: readonly AppClientRouteContribution[] = [
  defineAppRoutes([
    {
      name: 'approvalCenter',
      navigation: { title: 'center.navigation.group', icon: Stamp },
      breadcrumb: { title: 'center.navigation.group' },
      children: CENTER_ROUTES.map((route) => ({
        name: `approvalCenter${route.key[0].toUpperCase()}${route.key.slice(1)}`,
        path: route.path,
        auth: 'required' as const,
        authz: 'skip' as const,
        navigation: {
          title: `center.navigation.${route.key}`,
          icon: route.icon,
        },
        breadcrumb: { title: `center.navigation.${route.key}` },
        componentLoader: centerPage(route.page),
      })),
    },
  ]),
  defineAppRoutes([
    {
      name: 'lifecycleExample',
      navigation: { title: 'navigation.group', icon: RefreshCcw },
      breadcrumb: { title: 'navigation.group' },
      children: [
        {
          name: 'lifecycleExampleApprovals',
          path: '/lifecycle-example/approvals',
          auth: 'required',
          authz: 'skip',
          navigation: { title: 'navigation.approvals', icon: BadgeCheck },
          breadcrumb: { title: 'navigation.approvals' },
          componentLoader: () => import('./pages/approvals.js'),
        },
        {
          name: 'lifecycleExampleTickets',
          path: '/lifecycle-example/tickets',
          auth: 'required',
          authz: 'skip',
          navigation: { title: 'navigation.tickets', icon: Ticket },
          breadcrumb: { title: 'navigation.tickets' },
          componentLoader: () => import('./pages/tickets.js'),
        },
        {
          name: 'lifecycleExampleExpenses',
          path: '/lifecycle-example/expenses',
          auth: 'required',
          authz: 'skip',
          navigation: { title: 'navigation.expenses', icon: Receipt },
          breadcrumb: { title: 'navigation.expenses' },
          componentLoader: () => import('./pages/expenses.js'),
        },
      ],
    },
  ]),
];

export default routes;
