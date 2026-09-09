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
import SortPage from '../client/pages/sort-page.js';
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
      <SortPage />
    </I18nProvider>,
  );
}
it('shows builder and actual AST, preserves table order and handles intentional errors', async () => {
  await f.database
    .createSeeder({
      directory: path.resolve(import.meta.dirname, '../database/seeds'),
      packageName: '@nocobase/app-plugin-repository-example',
    })
    .run();
  await show();
  expect(f.requests).toHaveLength(0);
  const user = userEvent.setup();
  const card = screen.getByRole('region', { name: 'Product price descending' });
  expect(card).toHaveTextContent("s.field('unitPriceCents').desc()");
  await user.click(within(card).getByText('Actual request · JSON AST'));
  expect(card).toHaveTextContent('"direction": "desc"');
  await user.click(within(card).getByRole('button', { name: 'Run query' }));
  const table = await within(card).findByRole('table');
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent(
    '27-inch Monitor',
  );
  for (const name of [
    'Rejected: duplicate sort target',
    'Rejected: direct to-many field path',
  ]) {
    const invalid = screen.getByRole('region', { name });
    await user.click(
      within(invalid).getByRole('button', { name: 'Run query' }),
    );
    expect(await within(invalid).findByRole('status')).toHaveTextContent(
      'Expected validation error — INVALID_SORT',
    );
    expect(within(invalid).queryByRole('alert')).not.toBeInTheDocument();
  }
});
it('renders Chinese empty state and retries an unexpected failure', async () => {
  await show('zh-CN');
  expect(
    screen.getByRole('heading', { name: 'Sort 排序示例' }),
  ).toBeInTheDocument();
  const card = screen.getByRole('region', { name: '默认主键顺序' });
  const repository = f.api.repository('repositoryExampleCustomers');
  const spy = vi.spyOn(f.api, 'repository').mockReturnValueOnce({
    ...repository,
    findMany: () => {
      throw new Error('Connection failed');
    },
  });
  await userEvent.click(within(card).getByRole('button', { name: '运行查询' }));
  expect(await within(card).findByRole('alert')).toHaveTextContent(
    'Connection failed',
  );
  spy.mockRestore();
  await userEvent.click(within(card).getByRole('button', { name: '运行查询' }));
  expect(
    await within(card).findByRole('region', { name: '查询结果' }),
  ).toHaveTextContent('没有主记录');
  expect(within(card).queryByRole('alert')).not.toBeInTheDocument();
});
