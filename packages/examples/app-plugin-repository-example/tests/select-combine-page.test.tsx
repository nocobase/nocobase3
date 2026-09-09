import path from 'node:path';
import type { ApiClient } from '@nocobase/app-client';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import locales from '../client/locales/index.js';
import { createFixture } from './helpers.js';

const state = vi.hoisted(() => ({ api: undefined as ApiClient | undefined }));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useService: () => state.api,
}));
import SelectCombinePage from '../client/pages/select-combine-page.js';
let f: Awaited<ReturnType<typeof createFixture>>;
beforeEach(async () => {
  f = await createFixture();
  state.api = f.api;
});
afterEach(async () => {
  cleanup();
  await f.database.destroy();
});
async function show(locale = 'en-US') {
  const runtime = new I18nRuntime({
    defaultLocale: locale,
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test',
  });
  runtime.registerNamespace('@nocobase/app-plugin-repository-example', locales);
  await runtime.init(locale);
  render(
    <I18nProvider runtime={runtime}>
      <SelectCombinePage />
    </I18nProvider>,
  );
}
it('shows inspectable requests, executes each real query and refreshes results', async () => {
  await f.database
    .createSeeder({
      directory: path.resolve(import.meta.dirname, '../database/seeds'),
      packageName: '@nocobase/app-plugin-repository-example',
    })
    .run();
  await show();
  expect(f.requests).toHaveLength(0);
  const user = userEvent.setup();
  const cards = screen.getAllByRole('region');
  expect(cards).toHaveLength(5);
  for (const card of cards) {
    await user.click(within(card).getByText('Request · select AST'));
    expect(card).toHaveTextContent('"kind": "combine"');
    await user.click(within(card).getByRole('button', { name: 'Run query' }));
    expect(
      await within(card).findByRole('region', { name: 'Query result' }),
    ).toHaveTextContent('"id"');
  }
  const previewTable = within(cards[0]!).getByRole('table', {
    name: 'Order preview and independent branches — Data table',
    exact: true,
  });
  expect(
    within(previewTable).getByRole('columnheader', {
      name: 'orders.total',
      exact: true,
    }),
  ).toBeInTheDocument();
  const adaRow = within(previewTable).getByText('Ada Chen').closest('tr')!;
  expect(
    within(adaRow).getByRole('cell', { name: '2', exact: true }),
  ).toBeInTheDocument();
  expect(
    within(adaRow).getByRole('table', { name: /orders.preview$/ }),
  ).toHaveTextContent('DEMO-SO-001');
  expect(previewTable).toHaveTextContent('No related records');
  const nestedTable = within(cards[2]!).getByRole('table', {
    name: 'Nested orders, items and products — Data table',
    exact: true,
  });
  expect(nestedTable).toHaveTextContent('product.name');
  expect(nestedTable).toHaveTextContent('Mechanical Keyboard');
  await user.click(within(cards[0]!).getByText('Raw JSON'));
  expect(cards[0]).toHaveTextContent('"total": 2');
  const first = cards[0]!;
  expect(first).toHaveTextContent('Ada Chen');
  await f.api.repository('repositoryExampleCustomers').updateOne({
    filter: { id: 'demo-customer-1' },
    values: { name: 'Updated customer' },
  });
  await user.click(within(first).getByRole('button', { name: 'Run query' }));
  expect(
    await within(first).findByRole('region', { name: 'Query result' }),
  ).toHaveTextContent('Updated customer');
});
it('renders Chinese copy and an actionable empty-state message', async () => {
  await show('zh-CN');
  expect(
    screen.getByRole('heading', { name: 'Select 组合查询' }),
  ).toBeInTheDocument();
  const card = screen.getByRole('region', { name: '订单预览与独立分支' });
  await userEvent.click(within(card).getByRole('button', { name: '运行查询' }));
  expect(
    await within(card).findByRole('region', { name: '查询结果' }),
  ).toHaveTextContent('没有主记录');
});
it('shows a failed request and permits retry without affecting other cards', async () => {
  await show();
  const card = screen.getByRole('region', {
    name: 'Order preview and independent branches',
  });
  const repository = f.api.repository('repositoryExampleCustomers');
  const spy = vi.spyOn(f.api, 'repository').mockReturnValueOnce({
    ...repository,
    findMany: () => {
      throw new Error('Example request failed');
    },
  });
  await userEvent.click(
    within(card).getByRole('button', { name: 'Run query' }),
  );
  expect(await within(card).findByRole('alert')).toHaveTextContent(
    'Example request failed',
  );
  spy.mockRestore();
  await userEvent.click(
    within(card).getByRole('button', { name: 'Run query' }),
  );
  expect(
    await within(card).findByRole('region', { name: 'Query result' }),
  ).toHaveTextContent('No root records');
  expect(within(card).queryByRole('alert')).not.toBeInTheDocument();
});
