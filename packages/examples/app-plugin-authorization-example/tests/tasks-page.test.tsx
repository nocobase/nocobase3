import type { ApiClient } from '@nocobase/app-client';
import { ApiClientError } from '@nocobase/app-client';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import locales from '../client/locales/index.js';
import type { Task } from '../client/model.js';

const state = vi.hoisted(() => ({ api: undefined as ApiClient | undefined }));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useService: () => state.api,
}));
const { default: TasksPage } = await import('../client/pages/tasks-page.js');

afterEach(cleanup);

/** Only what the page reaches: one repository read. */
function fakeApi(findMany: () => Promise<Task[]>): ApiClient {
  return {
    repository: () => ({ findMany: () => findMany() }),
  } as unknown as ApiClient;
}

async function show(api: ApiClient): Promise<void> {
  state.api = api;
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US'],
    applicationNamespace: 'test',
  });
  runtime.registerNamespace(
    '@nocobase/app-plugin-authorization-example',
    locales,
  );
  await runtime.init('en-US');
  render(
    <I18nProvider runtime={runtime}>
      <TasksPage />
    </I18nProvider>,
  );
}

const task: Task = {
  id: 1,
  title: 'Write the seed',
  status: 'open',
  ownerId: 'alice',
  createdAt: '2026-09-15T00:00:00.000Z',
  updatedAt: '2026-09-15T00:00:00.000Z',
};

it('lists the caller’s tasks', async () => {
  await show(fakeApi(() => Promise.resolve([task])));

  await waitFor(() => expect(screen.getByText('Write the seed')).toBeVisible());
  expect(screen.getByText('Owner: alice')).toBeVisible();
});

it('shows a notice rather than an error when the caller holds no grant', async () => {
  await show(
    fakeApi(() =>
      Promise.reject(
        new ApiClientError('Forbidden', {
          status: 403,
          method: 'POST',
          url: 'http://example.test/authorizationExampleTasks:findMany',
        }),
      ),
    ),
  );

  await waitFor(() =>
    expect(
      screen.getByText('You have no grant on this collection'),
    ).toBeVisible(),
  );
  expect(screen.queryByRole('alert')).toBeNull();
});
