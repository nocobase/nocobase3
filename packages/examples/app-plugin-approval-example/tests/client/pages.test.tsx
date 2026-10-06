// The approval center and the lab rendered against the real routes and the
// real service on SQLite: the API client is a bridge to the router, so a
// click goes through the same path a browser's request would.
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createAppPaths } from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceContainer } from '@nocobase/service-provider';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Hono } from 'hono';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { InboxPage, LeavePage } from '../../client/center/pages.js';
import ApprovalLabPage from '../../client/lab/page.js';
import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import { DEMOS } from '../../shared/catalog.js';
import { key } from '../../server/lab/records.js';
import { apiRoutes } from '../../server/routes/index.js';
import { approvalExampleServiceToken } from '../../server/tokens.js';
import { createTestLab, type TestLab } from '../support/lab.js';

const mocked = vi.hoisted(() => ({ request: vi.fn(), language: 'zh-CN' }));
vi.mock('@nocobase/app-client', () => ({ useApiClient: () => mocked }));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    i18n: { language: mocked.language },
    t: (
      path: string,
      options?: { defaultValue?: string } & Record<string, unknown>,
    ): string => {
      let value: unknown = mocked.language === 'zh-CN' ? zhCN : enUS;
      for (const field of path.split('.'))
        value =
          value !== null && typeof value === 'object'
            ? (value as Record<string, unknown>)[field]
            : undefined;
      if (typeof value !== 'string') return options?.defaultValue ?? path;
      return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String((options as Record<string, unknown> | undefined)?.[name] ?? ''),
      );
    },
  }),
}));

const PERSONA = 'approval-example:persona';

let test: TestLab;

beforeEach(async () => {
  mocked.language = 'zh-CN';
  window.localStorage.clear();
  test = await createTestLab();
  const container = new ServiceContainer();
  container.instance(approvalExampleServiceToken, test.lab);
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
  const router = await apiRoutes.createRouter(app);
  mocked.request.mockImplementation(
    async (request: {
      path: string;
      query?: Record<string, string>;
      method?: string;
      json?: unknown;
    }) => {
      const url = new URL(`http://localhost/${request.path}`);
      for (const [name, value] of Object.entries(request.query ?? {}))
        url.searchParams.set(name, value);
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
  mocked.request.mockReset();
  await test.destroy();
});

it('submits leave as the applicant and approves it as the manager on the business page', async () => {
  render(<LeavePage />);
  fireEvent.click(await screen.findByRole('button', { name: '新建请假' }));
  // The route is previewed before submitting: two days go to the manager only.
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText('李四');
  fireEvent.click(within(dialog).getByRole('button', { name: '提交' }));
  await screen.findByRole('heading', { name: '张三的请假' });
  await screen.findAllByText('等待 李四', { exact: false });
  fireEvent.click(screen.getByRole('button', { name: '关闭' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  // Switch to the manager: the request waits in their list.
  fireEvent.click(screen.getByRole('button', { name: /^直属上级\s*李四/ }));
  await screen.findAllByText('审批：直属上级', { exact: false });
  fireEvent.click(screen.getAllByRole('button', { name: /张三的请假/ })[0]);
  fireEvent.click(await screen.findByRole('button', { name: '同意' }));
  await screen.findByText('已完成。');
  await waitFor(() =>
    expect(screen.getAllByText('已批准').length).toBeGreaterThan(0),
  );
  expect(screen.getAllByText('处理了任务').length).toBeGreaterThan(0);
});

it('collects tasks in the to-do center and needs a reason for a rejection', async () => {
  const review = await test.lab.create(
    'contractReview',
    { party: 'Acme', amount: 6_000, terms: 'Net 30' },
    'zhang',
  );
  await test.lab.runtime.fire(review.lifecycle, key(review.id), 'submit', {
    actor: { id: 'zhang' },
  });
  window.localStorage.setItem(PERSONA, 'li');
  render(<InboxPage />);
  fireEvent.click(
    await screen.findByRole('button', { name: /张三的合同评审/ }),
  );
  fireEvent.click(await screen.findByRole('button', { name: '驳回' }));
  const comment = await screen.findByRole('textbox', { name: '备注' });
  const confirm = screen.getAllByRole('button', { name: '驳回' }).at(-1)!;
  fireEvent.click(confirm);
  expect(comment).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(comment, { target: { value: '金额不对' } });
  fireEvent.click(confirm);
  await screen.findByText('已完成。');
  await waitFor(async () =>
    expect(
      (
        await test.lab.runtime.view(review.lifecycle, key(review.id), {
          id: 'li',
        })
      ).state,
    ).toBe('rejected'),
  );
});

it('loads the samples and offers the administration in the lab', async () => {
  window.localStorage.setItem(PERSONA, 'admin');
  render(<ApprovalLabPage />);
  fireEvent.click(await screen.findByRole('button', { name: '加载示例草稿' }));
  await screen.findByText(`创建了 ${DEMOS.length} 个示例。`);
  await screen.findByText('演示管理');
  // Every scenario lists its sample, which opens with its inner workings.
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /#\d+/ }).length).toBe(
      DEMOS.length,
    ),
  );
  fireEvent.click(screen.getAllByRole('button', { name: /#\d+/ })[0]);
  await screen.findByText('内部状态');
  await screen.findByText('转换日志');
});
