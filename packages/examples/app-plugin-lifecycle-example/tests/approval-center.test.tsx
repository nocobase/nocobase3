import path from 'node:path';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import sqlite from '@nocobase/db-sqlite';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createAppPaths } from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  InboxPage,
  LeavePage,
  PurchasePage,
} from '../client/approval-center/pages.js';
import { ApprovalCenterService } from '../server/approval-center/service.js';
import enUS from '../client/locales/en-US.js';
import zhCN from '../client/locales/zh-CN.js';
import { ApprovalLabService } from '../server/approval-lab/service.js';
import { createApprovalLabStore } from '../server/approval-lab/store.js';
import { approvalLabRoutes } from '../server/routes/approval-lab.js';
import { approvalLabServiceToken } from '../server/tokens.js';
import { LIFECYCLE_EXAMPLE_COLLECTIONS } from '../server/scope.js';

const mocked = vi.hoisted(() => ({ request: vi.fn(), language: 'en-US' }));
vi.mock('@nocobase/app-client', () => ({ useApiClient: () => mocked }));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    i18n: { language: mocked.language },
    t: (
      key: string,
      options?: { defaultValue?: string } & Record<string, unknown>,
    ): string => {
      let value: unknown = mocked.language === 'zh-CN' ? zhCN : enUS;
      for (const field of key.split('.'))
        value =
          value !== null && typeof value === 'object'
            ? (value as Record<string, unknown>)[field]
            : undefined;
      if (typeof value !== 'string') return options?.defaultValue ?? key;
      return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String((options as Record<string, unknown> | undefined)?.[name] ?? ''),
      );
    },
  }),
}));

let database: DatabaseManager;
let service: ApprovalLabService;

beforeEach(async () => {
  mocked.language = 'zh-CN';
  window.localStorage.clear();
  database = createDatabaseManager({
    drivers: { sqlite },
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await database
    .createMigrator({
      directory: path.resolve(import.meta.dirname, '../database/migrations'),
      packageName: '@nocobase/app-plugin-lifecycle-example',
    })
    .latest();
  const runtime = new LifecycleRuntime({
    store: createApprovalLabStore(
      createRepositoryLifecycleStore(database, {
        collections: {
          transitions: LIFECYCLE_EXAMPLE_COLLECTIONS.transitions,
          effectRuns: LIFECYCLE_EXAMPLE_COLLECTIONS.effectRuns,
        },
      }),
    ),
  });
  service = new ApprovalLabService(database, runtime);
  await service.start();
  const container = new ServiceContainer();
  container.instance(approvalLabServiceToken, service);
  container.instance(authenticationToken, {
    required: () => async (_context, next) => {
      await next();
    },
  } as Auth);
  const app: AppPluginApplication = {
    appName: 'main',
    publicBasePath: '',
    config: {} as never,
    paths: createAppPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  };
  const router = await approvalLabRoutes.createRouter(app);
  mocked.request.mockImplementation(
    async (request: {
      path: string;
      query?: Record<string, string>;
      method?: string;
      json?: unknown;
    }) => {
      const url = new URL(`http://localhost/${request.path}`);
      for (const [key, value] of Object.entries(request.query ?? {}))
        url.searchParams.set(key, value);
      const response = await router.request(
        new Request(url, {
          method: request.method ?? 'GET',
          ...(request.json === undefined
            ? {}
            : {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(request.json),
              }),
        }),
      );
      if (!response.ok)
        throw Object.assign(new Error('Request refused'), {
          payload: await response.json(),
        });
      return response.status === 204 ? undefined : response.json();
    },
  );
});
afterEach(async () => {
  cleanup();
  await database.destroy();
  mocked.request.mockReset();
});

it('plans, summarizes and lists requests as business work for each person', async () => {
  const center = new ApprovalCenterService(service);
  const short = center.preview('leaveTiered', { days: 2 }, 'zhang');
  expect(short.steps.map((step) => [step.key, step.people])).toEqual([
    ['manager', ['li']],
  ]);
  const long = center.preview('leaveTiered', { days: 5 }, 'zhang');
  expect(long.steps.map((step) => [step.key, step.people])).toEqual([
    ['manager', ['li']],
    ['deptManager', ['wang']],
    ['hr', ['hr']],
  ]);
  const purchase = center.preview(
    'purchase',
    {
      items: [
        { category: 'hardware', name: 'Laptop', amount: 8000 },
        { category: 'office', name: 'Desk', amount: 2000 },
      ],
    },
    'zhang',
  );
  expect(purchase.mode).toBe('parallel');
  expect(purchase.steps.map((step) => [step.key, step.people])).toEqual([
    ['it', ['itA']],
    ['facilities', ['facA']],
  ]);

  const created = await service.create(
    'leaveTiered',
    { title: 'Leave', content: { days: 5, reason: 'Trip' } },
    'zhang',
  );
  await service.runtime.fire('approvalRequests', created.id, 'submit', {
    actor: { id: 'zhang' },
  });
  const li = await center.overview('li');
  const record = li.records.find((item) => item.id === created.id);
  expect(record).toMatchObject({
    business: 'leave',
    kind: 'leaveTiered',
    status: 'inReview',
    handlers: ['li'],
    step: 'manager',
  });
  expect(record?.createdAt).toEqual(expect.any(String));
  expect(li.inbox).toContainEqual(
    expect.objectContaining({
      box: 'toDo',
      recordId: created.id,
      action: 'decide',
    }),
  );
  const zhang = await center.overview('zhang');
  expect(zhang.inbox).toContainEqual(
    expect.objectContaining({ box: 'mine', recordId: created.id }),
  );
  expect(zhang.inbox.some((item) => item.box === 'toDo')).toBe(false);
});

it('submits leave as the applicant and approves it as the manager on the business page', async () => {
  render(<LeavePage />);
  fireEvent.click(await screen.findByRole('button', { name: '发起请假' }));
  fireEvent.change(screen.getByRole('textbox', { name: '事由' }), {
    target: { value: '家里有事' },
  });
  // The route is previewed before submitting: two days go to the manager only.
  await screen.findByText('直属经理审批');
  fireEvent.click(screen.getByRole('button', { name: '提交' }));
  await screen.findByRole('heading', { name: '张三的请假申请' });
  await screen.findAllByText('等待 李四 处理', { exact: false });

  // The submitted request opens in a dialog over the list.
  expect(screen.getByRole('dialog')).toHaveTextContent('审批流程');
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: /直属经理.*李四/ }));
  await screen.findAllByText('待你审批', { exact: false });
  fireEvent.click(screen.getAllByRole('button', { name: /张三的请假申请/ })[0]);
  fireEvent.click(await screen.findByRole('button', { name: '同意' }));
  fireEvent.change(screen.getByRole('textbox', { name: '审批意见（选填）' }), {
    target: { value: '注意交接' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认同意' }));
  await screen.findByText('操作成功。');
  await waitFor(() =>
    expect(screen.getAllByText('已通过').length).toBeGreaterThan(0),
  );
  expect(screen.getAllByText('注意交接').length).toBeGreaterThan(0);
  expect(screen.getByText('同意了')).toBeInTheDocument();
  // Under each transition, the timeline says what it did to the stages.
  expect(
    await screen.findByText('直属经理审批：待办交给 李四'),
  ).toBeInTheDocument();
  expect(screen.getByText('直属经理审批 通过')).toBeInTheDocument();
});

it('collects tasks from every business in the to-do center and handles them in place', async () => {
  const contract = await service.create(
    'contract',
    {
      title: '张三的合同审批',
      content: { party: 'Acme', terms: 'Net 30', amount: 6000 },
    },
    'zhang',
  );
  await service.runtime.fire('approvalRequests', contract.id, 'submit', {
    actor: { id: 'zhang' },
  });
  const leave = await service.create(
    'leaveTiered',
    { title: '张三的请假申请', content: { days: 1, reason: '看病' } },
    'zhang',
  );
  await service.runtime.fire('approvalRequests', leave.id, 'submit', {
    actor: { id: 'zhang' },
  });
  window.localStorage.setItem(
    'lifecycle-example:approval-center:persona',
    'li',
  );
  render(<InboxPage />);
  await screen.findByRole('button', { name: /张三的合同审批/ });
  expect(
    screen.getByRole('button', { name: /张三的请假申请/ }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /张三的合同审批/ }));
  fireEvent.click(await screen.findByRole('button', { name: '驳回' }));
  fireEvent.click(screen.getByRole('button', { name: '确认驳回' }));
  // A rejection needs a reason; the form says so instead of sending it.
  expect(screen.getByRole('textbox', { name: '理由' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  fireEvent.change(screen.getByRole('textbox', { name: '理由' }), {
    target: { value: '金额不对' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认驳回' }));
  await screen.findByText('操作成功。');
  await waitFor(async () =>
    expect(
      (
        await service.runtime.view('approvalRequests', contract.id, {
          id: 'li',
        })
      ).state,
    ).toBe('rejected'),
  );
});

it('starts a purchase across departments and opens a department branch from the parent', async () => {
  render(<PurchasePage />);
  fireEvent.click(await screen.findByRole('button', { name: '发起采购' }));
  fireEvent.click(screen.getByRole('button', { name: /多部门联合采购/ }));
  const names = screen.getAllByRole('textbox', { name: '物品' });
  fireEvent.change(names[0], { target: { value: '笔记本电脑' } });
  fireEvent.change(names[1], { target: { value: '办公桌' } });
  const amounts = screen.getAllByRole('spinbutton', { name: '金额' });
  fireEvent.change(amounts[0], { target: { value: '8000' } });
  fireEvent.change(amounts[1], { target: { value: '2000' } });
  fireEvent.change(screen.getByRole('textbox', { name: '事由' }), {
    target: { value: '新员工入职' },
  });
  await screen.findByText('IT 部门审核');
  fireEvent.click(screen.getByRole('button', { name: '提交' }));
  await screen.findByText('2 路并行', { exact: false });
  fireEvent.click(await screen.findByRole('button', { name: /IT 部门审核/ }));
  await screen.findByRole('button', { name: /返回/ });
  await screen.findByText('所属：', { exact: false });
});
