import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { NamespaceScope } from '@nocobase/i18n/client';
import {
  createAuditClientRuntime,
  renderAuditClient,
} from '../helpers/client-fixture.js';
import { AuditEventsView } from '@nocobase/app-plugin-audit/client/components';
import type { AuditEventsQuery } from '@nocobase/app-plugin-audit/client/contracts';
import { createAuditApiFixture } from '../helpers/api-fixture.js';
import { normalizeEvent } from '../../server/event-normalizer.js';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  for (const close of cleanups.splice(0).reverse()) await close();
});

async function fixture(locale: string = 'en-US', grants: boolean = true) {
  const server = await createAuditApiFixture('sqlite');
  cleanups.push(server.cleanup);
  if (grants)
    await server.grant(server.alice.id, ['read', 'readAll', 'readMetadata']);
  for (const [id, kind, operationId] of [
    ['one', 'request', 'approval'],
    ['two', 'database', 'approval'],
    ['three', 'business', 'other'],
  ] as const) {
    const normalized = normalizeEvent(
      {
        action:
          id === 'three' ? '<img src=x onerror=alert(1)>' : 'orders.approve',
        outcome: 'success',
        target: { dataSource: 'main', resource: 'documents', key: 'a' },
        details: { text: '<script>window.AUDIT_XSS = true</script>' },
      },
      {
        scope: {
          ...server.f.scope,
          actor: { type: 'workflow', id: 'workflow-run' },
          initiator: { type: 'user', id: 'original-human' },
          operationId,
        },
        kind,
        producer: 'retired-plugin',
        id,
        store: 'main',
        occurredAt: '2026-09-05T00:00:00.000Z',
        recordedAt: '2026-09-05T00:00:00.000Z',
        policyVersion: 1,
      },
    );
    await server.f.store.append(normalized.event);
  }
  const runtime = await createAuditClientRuntime(locale);
  const requests: string[] = [];
  let mode: 'normal' | 'network' | 'degraded' | 'denied' = 'normal';
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (mode === 'network') throw new TypeError('Synthetic network failure');
    if (mode === 'degraded')
      return new Response(JSON.stringify({ code: 'AUDIT_NOT_READY' }), {
        status: 503,
      });
    const path = String(url).replace(/^.*[/]api[/]audit/, '');
    requests.push(path);
    return server.request(
      path,
      mode === 'denied' ? server.bob.cookie : server.alice.cookie,
      init,
    );
  });
  const query: AuditEventsQuery = {
    store: 'main',
    pageSize: 2,
    target: {
      dataSource: 'main',
      resource: 'documents',
      key: 'a',
      label: 'Display-only target label',
    },
  };
  await renderAuditClient(
    runtime,
    <NamespaceScope ns='@example/audit-host'>
      <AuditEventsView query={query} />
    </NamespaceScope>,
    cleanups,
  );
  return {
    server,
    runtime,
    requests,
    mode: (next: typeof mode) => {
      mode = next;
    },
  };
}

describe('public UI with the real audit router, authentication, SQL authorization and SQLite store', () => {
  it('renders persisted facts, cursor pagination, actor/initiator and operation detail', async () => {
    const f = await fixture();
    await screen.findByText('approval · 1 facts on this page');
    expect(screen.getAllByText(/original-human/).length).toBeGreaterThan(0);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 2');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled(),
    );
    expect(f.requests.some((path) => path.includes('cursor='))).toBe(true);
    const trigger = screen.getByRole('button', { name: /orders.approve/ });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Related facts in this operation');
    await waitFor(() =>
      expect(within(dialog).getAllByText('orders.approve')).toHaveLength(3),
    );
    expect(within(dialog).getAllByText('Request').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Database').length).toBeGreaterThan(0);
    expect(
      f.requests.some(
        (path) =>
          path.startsWith('/operations/approval?') && path.includes('target='),
      ),
    ).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('filters through the real API and resets cursor pagination', async () => {
    const f = await fixture();
    await screen.findByText('approval · 1 facts on this page');
    fireEvent.change(screen.getByLabelText('Event kind'), {
      target: { value: 'database' },
    });
    fireEvent.change(screen.getByLabelText('Actor ID'), {
      target: { value: 'workflow-run' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /orders.approve/ }),
      ).toHaveLength(1),
    );
    expect(f.requests.at(-1)).toContain('kind=database');
    expect(f.requests.at(-1)).toContain('actorId=workflow-run');
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('resolves the formal Settings page and paginates related facts without dropping the target scope', async () => {
    const f = await fixture();
    const setting = f.runtime.settings.find(
      (entry) => entry.path === '/settings/audit/events',
    );
    expect(setting?.access).toEqual({
      resource: 'audit.events',
      action: 'read',
    });
    expect(typeof (await setting?.pageLoader())?.default).toBe('function');
    for (let index = 0; index < 27; index++)
      await f.server.append('extra-' + index);
    fireEvent.change(screen.getByLabelText('Operation'), {
      target: { value: 'same-operation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    const triggers = await screen.findAllByRole('button', {
      name: /synthetic.read/,
    });
    fireEvent.click(triggers[0]);
    const dialog = await screen.findByRole('dialog');
    const more = await within(dialog).findByRole('button', {
      name: 'Load more related facts',
    });
    expect(within(dialog).getAllByText('synthetic.read')).toHaveLength(26);
    fireEvent.click(more);
    await waitFor(() =>
      expect(within(dialog).getAllByText('synthetic.read')).toHaveLength(28),
    );
    expect(
      within(dialog).queryByRole('button', { name: 'Load more related facts' }),
    ).toBeNull();
    expect(
      f.requests.some(
        (path) =>
          path.startsWith('/operations/same-operation?') &&
          path.includes('cursor=') &&
          path.includes('target='),
      ),
    ).toBe(true);
  });

  it('does not fall back to the list DTO when detail access is denied', async () => {
    const f = await fixture();
    const triggers = await screen.findAllByRole('button', {
      name: /orders.approve/,
    });
    f.mode('denied');
    fireEvent.click(triggers[0]);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('alert');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('permission');
    expect(within(dialog).queryByText('orders.approve')).toBeNull();
    expect(within(dialog).queryByText('retired-plugin')).toBeNull();
  });

  it('distinguishes server denial, degraded storage, network failure and empty results', async () => {
    const f = await fixture('en-US', false);
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('permission');
    expect(screen.queryByText(/No audit events match/)).toBeNull();
    await f.server.grant(f.server.alice.id, ['read', 'readAll']);
    f.mode('degraded');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('degraded'),
    );
    f.mode('network');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('connection'),
    );
    f.mode('normal');
    fireEvent.change(screen.getByLabelText('Action'), {
      target: { value: 'absent-action' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByText('No audit events match this query.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders Chinese outside the plugin namespace and treats retired action text as text', async () => {
    await fixture('zh-CN');
    const trigger = await screen.findByRole('button', {
      name: /<img src=x onerror=/,
    });
    expect(document.querySelector('img')).toBeNull();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('retired-plugin');
    expect(within(dialog).getByText(/<script>window.AUDIT_XSS/)).toBeVisible();
    expect(dialog.querySelector('script')).toBeNull();
    expect(within(dialog).getAllByText(/原始发起者/).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭详情' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
