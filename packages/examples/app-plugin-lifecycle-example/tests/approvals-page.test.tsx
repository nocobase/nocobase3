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

import ApprovalsPage from '../client/pages/approvals.js';
import enUS from '../client/locales/en-US.js';
import zhCN from '../client/locales/zh-CN.js';
import { ApprovalLabService } from '../server/approval-lab/service.js';
import { createApprovalLabStore } from '../server/approval-lab/store.js';
import { approvalLabRoutes } from '../server/routes/approval-lab.js';
import { approvalLabServiceToken } from '../server/tokens.js';
import { LIFECYCLE_EXAMPLE_COLLECTIONS } from '../server/scope.js';
import { APPROVAL_DEMOS } from '../shared/approval-lab.js';

const mocked = vi.hoisted(() => ({ request: vi.fn(), language: 'en-US' }));
vi.mock('@nocobase/app-client', () => ({ useApiClient: () => mocked }));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    i18n: { language: mocked.language },
    t: (key: string, options?: { defaultValue?: string }): string => {
      let value: unknown = mocked.language === 'zh-CN' ? zhCN : enUS;
      for (const field of key.split('.'))
        value =
          value !== null && typeof value === 'object'
            ? (value as Record<string, unknown>)[field]
            : undefined;
      return typeof value === 'string' ? value : (options?.defaultValue ?? key);
    },
  }),
}));

let database: DatabaseManager;
let service: ApprovalLabService;

beforeEach(async () => {
  mocked.language = 'en-US';
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

async function choose(label: string, option: string): Promise<void> {
  fireEvent.click(
    await screen.findByRole('combobox', { name: label, exact: true }),
  );
  const item = await screen.findByRole('option', { name: option, exact: true });
  fireEvent.pointerDown(item, { pointerType: 'mouse' });
  fireEvent.mouseUp(item);
  fireEvent.click(item);
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: label, exact: true }),
    ).toHaveAttribute('aria-expanded', 'false'),
  );
}

it('creates, submits and approves a request through the page and the production router', async () => {
  render(<ApprovalsPage />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'New request', exact: true }),
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Title', exact: true }),
    { target: { value: 'UI leave request' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Create draft', exact: true }),
  );
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Action' })).not.toBeDisabled(),
  );
  await choose('Action', 'Submit');
  fireEvent.click(screen.getByRole('button', { name: 'Execute action' }));
  await screen.findByText('Current approver: li');
  await choose('Example identity', 'li');
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Action' })).not.toBeDisabled(),
  );
  await choose('Action', 'Approve');
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Comment', exact: true }),
    { target: { value: 'Enjoy your leave' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Execute action' }));
  await waitFor(async () =>
    expect((await service.overview('zhang')).records[0].status).toBe(
      'registered',
    ),
  );
  const row = (await service.overview('zhang')).records[0];
  const view = await service.runtime.view(row.lifecycle, row.id, {
    id: 'zhang',
  });
  expect(
    view.history.transitions.find((entry) => entry.transition === 'approve')
      ?.input.comment,
  ).toBe('Enjoy your leave');
});

it('loads the sample drafts through the page without resetting them', async () => {
  render(<ApprovalsPage />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Load sample drafts',
      exact: true,
    }),
  );
  await waitFor(async () =>
    expect((await service.overview('zhang')).records).toHaveLength(
      APPROVAL_DEMOS.length,
    ),
  );
  await service.runtime.fire('leaveRequests', 'sample:leave', 'submit', {
    actor: { id: 'zhang' },
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Load sample drafts', exact: true }),
    ).not.toBeDisabled(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Load sample drafts', exact: true }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Load sample drafts', exact: true }),
    ).not.toBeDisabled(),
  );
  expect(
    (await service.runtime.view('leaveRequests', 'sample:leave', { id: 'li' }))
      .state,
  ).toBe('pending');
});

it('renders Chinese copy and validates adding and removing expense lines', async () => {
  mocked.language = 'zh-CN';
  render(<ApprovalsPage />);
  await screen.findByRole('heading', { name: '审批场景', exact: true });
  fireEvent.click(
    screen.getByRole('button', { name: '新建申请', exact: true }),
  );
  await choose('审批场景', '23 · 分项报销审批');
  expect(
    screen.getAllByRole('spinbutton', { name: '金额（分）' }),
  ).toHaveLength(2);
  fireEvent.click(
    screen.getByRole('button', { name: '添加条目', exact: true }),
  );
  expect(
    screen.getAllByRole('spinbutton', { name: '金额（分）' }),
  ).toHaveLength(3);
  fireEvent.click(
    screen.getAllByRole('button', { name: '移除条目', exact: true })[2],
  );
  fireEvent.click(screen.getByRole('button', { name: '创建草稿' }));
  await waitFor(async () =>
    expect((await service.overview('zhang')).records).toHaveLength(1),
  );
  const row = (await service.overview('zhang')).records[0];
  expect(
    (await service.runtime.view(row.lifecycle, row.id, { id: 'zhang' })).record
      .lines,
  ).toHaveLength(2);
});
