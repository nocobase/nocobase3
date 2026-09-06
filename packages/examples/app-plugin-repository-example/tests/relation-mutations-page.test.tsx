import path from 'node:path';
import type { ApiClient } from '@nocobase/app-client';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import locales from '../client/locales/index.js';
import { createFixture } from './helpers.js';

const state = vi.hoisted(() => ({ api: undefined as ApiClient | undefined }));

vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<typeof import('@nocobase/app-client')>()),
  useService: () => state.api,
}));

import RelationMutationsPage from '../client/pages/relation-mutations-page.js';

let fixture: Awaited<ReturnType<typeof createFixture>>;

beforeEach(async () => {
  fixture = await createFixture();
  state.api = fixture.api;
  await fixture.database
    .createSeeder({
      directory: path.resolve(import.meta.dirname, '../database/seeds'),
      packageName: '@nocobase/app-plugin-repository-example',
    })
    .run();

  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US'],
    applicationNamespace: 'test',
  });
  runtime.registerNamespace('@nocobase/app-plugin-repository-example', locales);
  await runtime.init('en-US');
  render(
    <I18nProvider runtime={runtime}>
      <RelationMutationsPage />
    </I18nProvider>,
  );
});

afterEach(async () => {
  cleanup();
  await fixture.database.destroy();
});

it('renders the seeded graph and runs the complete relationship workflow', async () => {
  const user = userEvent.setup();
  const baseline = await screen.findByRole('region', {
    name: 'Seeded relationship baseline',
  });
  expect(baseline).toHaveTextContent('Repository guide');
  expect(baseline).toHaveTextContent('Ada');
  expect(baseline).toHaveTextContent('Current project profile');
  expect(baseline).toHaveTextContent('Documentation · role=secondary');
  expect(within(baseline).getAllByRole('row')).toHaveLength(4);

  await user.click(
    screen.getByRole('button', { name: 'Run complete relationship write' }),
  );
  const result = await screen.findByRole('region', {
    name: 'Final relationship state',
  });
  expect(result).toHaveTextContent('Bob');
  expect(result).toHaveTextContent('Profile updated in place');
  expect(result).toHaveTextContent('Task updated in relation scope');
  expect(result).toHaveTextContent('Database · role=primary');
  expect(result).toHaveTextContent('Documentation · role=secondary');
  expect(within(result).getAllByRole('row')).toHaveLength(5);

  const lifetime = screen.getByRole('region', {
    name: 'Target lifetime checks',
  });
  expect(lifetime).toHaveTextContent('disconnect: task exists=true');
  expect(lifetime).toHaveTextContent('projectId=NULL');
  expect(lifetime).toHaveTextContent('delete: task exists=false');
  expect(lifetime).toHaveTextContent('set: removed tag exists=true');

  await waitFor(() => {
    const projectUpdates = fixture.requests.filter((request) =>
      request.path.endsWith('repositoryExampleRelationProjects:updateOne'),
    );
    expect(projectUpdates).toHaveLength(2);
    expect(projectUpdates[0]?.body).toMatchObject({
      values: {
        tasks: {
          create: expect.any(Object),
          connect: expect.any(Object),
          disconnect: expect.any(Object),
          update: expect.any(Object),
          upsert: expect.any(Object),
          delete: expect.any(Object),
        },
      },
    });
    expect(projectUpdates[1]?.body).toMatchObject({
      values: { tags: { set: expect.any(Array) } },
    });
  });
});
