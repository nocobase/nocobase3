import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import {
  AppClientRoot,
  ClientApplication,
  createAppClientConfig,
} from '@nocobase/app-client';
import {
  defineAppRuntime,
  resolveAppRuntime,
} from '@nocobase/app-client/runtime';
import { defineClientPlugins } from '@nocobase/app-client/plugins';
import { I18nProvider } from '@nocobase/i18n/client';
import { ServiceProvider } from '@nocobase/service-provider';
import audit from '../../client/index.js';
import type { AuditSettingsResponse } from '../../client/contracts.js';
import { createSettingsFixture } from '../helpers/settings-fixture.js';
import { auditRaw } from '../helpers/database-fixtures.js';

class TestProvider extends ServiceProvider<ClientApplication> {
  readonly name: string = '@example/g14';
  override boot(): Promise<void> {
    this.app.refine.setRouterProvider({});
    return Promise.resolve();
  }
}
const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  for (const close of closes.splice(0).reverse()) await close();
});

async function fixture(
  locale: string = 'en-US',
  manage: boolean = true,
  required: boolean = false,
) {
  const server = await createSettingsFixture('sqlite', required);
  closes.push(server.cleanup);
  await server.grant(
    server.alice.id,
    [],
    manage ? ['read', 'manage'] : ['read'],
  );
  const runtime = await resolveAppRuntime(
    defineAppRuntime({
      packageName: '@example/g14',
      config: createAppClientConfig,
      serviceProviders: [TestProvider],
      plugins: defineClientPlugins([audit()]),
    }),
  );
  await runtime.i18n.changeLanguage(locale);
  const route = runtime.settings.find(
    (entry) => entry.path === '/settings/audit/settings',
  );
  if (!route) throw new Error('Missing real settings contribution');
  const { default: Page } = await route.pageLoader();
  const writes: RequestInit[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') writes.push(init);
    return server.request(
      String(url).replace(/^.*[/]api[/]audit/, ''),
      server.alice.cookie,
      init,
    );
  });
  const app = new ClientApplication({
    runtime,
    createRenderConfig: () => ({
      routes: (
        <I18nProvider runtime={runtime.i18n}>
          <Page />
        </I18nProvider>
      ),
    }),
  });
  await app.start();
  closes.push(() => app.shutdown());
  const view = render(<AppClientRoot app={app} />);
  await screen.findByText(locale === 'zh-CN' ? '版本 1' : 'Revision 1');
  return { server, writes, view, app, runtime };
}

describe('real settings UI, authenticated Hono API and SQLite persistence', () => {
  it('saves through revision API and remains persisted after reload', async () => {
    const f = await fixture();
    fireEvent.change(screen.getByLabelText('Retention days'), {
      target: { value: '240' },
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Save settings' }),
    );
    await screen.findByText('Revision 2');
    expect(f.writes).toHaveLength(1);
    expect(new Headers(f.writes[0]?.headers).get('if-match')).toBe('"1"');
    const persisted = await f.server.settings.get(f.server.f.scope);
    expect(persisted.retentionDays).toBe(240);
    expect(screen.getByText(/Configuration saved/)).toBeVisible();
    const fresh = await f.server.request('/settings?store=main');
    expect(
      ((await fresh.json()) as AuditSettingsResponse).data.retentionDays,
    ).toBe(240);
  });
  it('keeps another editor revision and draft until explicit comparison', async () => {
    const f = await fixture();
    const original = await f.server.settings.get(f.server.f.scope);
    await f.server.settings.update(f.server.f.scope, {
      expectedRevision: 1,
      settings: { ...original, retentionDays: 300 },
      confirmRetentionReduction: false,
    });
    fireEvent.change(screen.getByLabelText('Retention days'), {
      target: { value: '250' },
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Save settings' }),
    );
    await screen.findByText(/Your draft is retained/);
    expect(screen.getByLabelText('Retention days')).toHaveValue('250');
    expect((await f.server.settings.get(f.server.f.scope)).retentionDays).toBe(
      300,
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Load current settings for comparison',
      }),
    );
    await screen.findByText('Current server settings');
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use current settings and edit again',
      }),
    );
    expect(screen.getByLabelText('Retention days')).toHaveValue('300');
  });
  it('requires explicit retention reduction confirmation and rejects invalid days', async () => {
    const f = await fixture();
    fireEvent.change(screen.getByLabelText('Retention days'), {
      target: { value: '0' },
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Save settings' }),
    );
    await screen.findByText(/Invalid settings/);
    expect(f.writes).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Retention days'), {
      target: { value: '30' },
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Save settings' }),
    );
    await screen.findByRole('dialog');
    expect(f.writes).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(f.writes).toHaveLength(0);
    await userEvent.click(
      screen.getByRole('button', { name: 'Save settings' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm and save' }),
    );
    await screen.findByText('Revision 2');
    expect((await f.server.settings.get(f.server.f.scope)).retentionDays).toBe(
      30,
    );
  });
  it('persists null retention and confirms switching back to finite days', async () => {
    const f = await fixture();
    await userEvent.click(
      screen.getByLabelText('Do not automatically delete (null)'),
    );
    expect(screen.getByLabelText('Retention days')).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Save settings' }),
    );
    await screen.findByText('Revision 2');
    expect(
      (await f.server.settings.get(f.server.f.scope)).retentionDays,
    ).toBeNull();
    await userEvent.click(
      screen.getByLabelText('Do not automatically delete (null)'),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save settings' }),
    );
    await screen.findByRole('dialog');
    expect(f.writes).toHaveLength(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm and save' }),
    );
    await screen.findByText('Revision 3');
    expect((await f.server.settings.get(f.server.f.scope)).retentionDays).toBe(
      180,
    );
  });
  it('prevents mandatory HTTP removal and server rejects crafted updates', async () => {
    const f = await fixture('en-US', true, true);
    expect(screen.getByLabelText('Enable audit')).toBeDisabled();
    expect(screen.getByLabelText('Declared HTTP routes')).toBeDisabled();
    const settings = await f.server.settings.get(f.server.f.scope);
    const response = await f.server.request('/settings?store=main', undefined, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': '"1"' },
      body: JSON.stringify({
        expectedRevision: 1,
        settings: { ...settings, enabled: false },
        confirmRetentionReduction: false,
      }),
    });
    expect(response.status).toBe(409);
  });
  it('renders read-only for actual read permission without manage', async () => {
    await fixture('en-US', false);
    expect(
      screen.getByRole('button', { name: 'Save settings' }),
    ).toBeDisabled();
    expect(screen.getByText(/Read only:/)).toBeVisible();
  });
  it('shows unsupported data source errors from the backend', async () => {
    await fixture();
    await userEvent.click(screen.getByRole('button', { name: 'Add target' }));
    fireEvent.change(screen.getByLabelText('Physical table'), {
      target: { value: 'orders' },
    });
    fireEvent.change(screen.getByLabelText('Data source'), {
      target: { value: 'not-allowed' },
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Save settings' }),
    );
    await screen.findByText('Permission denied for this store or operation.');
  });
  it('preserves real degraded health when the settings table is unavailable', async () => {
    const f = await fixture();
    await auditRaw(f.server.f.connection, 'DROP TABLE "auditSettings"');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText('Degraded');
    expect(screen.getAllByText(/AUDIT_WRITE_FAILED/).length).toBeGreaterThan(0);
    expect(
      screen.queryByText('Ready — no events observed'),
    ).not.toBeInTheDocument();
  });
  it('renders Chinese, disabled and unknown independently', async () => {
    const f = await fixture('zh-CN');
    expect(screen.getByRole('button', { name: '保存设置' })).toBeVisible();
    await userEvent.click(screen.getByLabelText('启用审计'));
    await userEvent.click(screen.getByRole('button', { name: '保存设置' }));
    await screen.findByText('已禁用');
    fireEvent.change(screen.getByLabelText('实例'), {
      target: { value: 'unobserved-instance' },
    });
    await userEvent.click(screen.getByRole('button', { name: '刷新' }));
    await screen.findByText('此实例或存储尚未被观察。');
    expect(f.view.container.textContent).not.toMatch(
      /settings[.]|postgres:|mysql:|synthetic-secret/,
    );
    await waitFor(() => expect(screen.getByText('部分覆盖')).toBeVisible());
  });
});
