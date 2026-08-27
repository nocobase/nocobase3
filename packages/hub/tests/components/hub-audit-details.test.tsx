import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuditLogPage } from '@/pages/audit/list';

function response<T>(
  data: T,
  options: { total?: number; limit?: number; offset?: number } = {},
) {
  return Response.json({
    data,
    meta: {
      total: options.total ?? (Array.isArray(data) ? data.length : 1),
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
    },
    requestId: 'audit-component-test',
  });
}

const auditSummary = {
  id: 'audit-1',
  actor: {
    type: 'user',
    id: 'member-1',
    name: 'Alice',
    email: 'alice@example.com',
  },
  application: { id: 'app-1', name: 'Inventory', slug: 'inventory' },
  action: 'deployment.succeeded',
  resource: 'deployment',
  resourceId: 'deployment-1',
  result: 'success',
  source: 'agent',
  createdAt: '2026-08-25T01:00:00.000Z',
};

function createFetcher() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input), 'http://hub.test');
    if (url.pathname.endsWith('/me')) {
      return response({
        user: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
        roles: ['owner'],
        capabilities: {
          global: [{ resource: 'hub.auditLog', actions: ['read', 'export'] }],
          application: [],
        },
      });
    }
    if (url.pathname.endsWith('/apps')) {
      return response([
        {
          id: 'app-1',
          name: 'Inventory',
          slug: 'inventory',
        },
      ]);
    }
    if (url.pathname.endsWith('/audit-logs/audit-1')) {
      return response({
        ...auditSummary,
        client: {
          credentialId: 'credential-1',
          name: 'Codex on Mac',
          ip: '203.0.113.10',
        },
        details: {
          version: '1.4.0',
          checksum: 'sha256:95b5799',
          note: '<img src=x onerror=alert(1)>',
        },
        requestId: 'request-1',
      });
    }
    if (url.pathname.endsWith('/audit-logs')) {
      return response([auditSummary], {
        total: 45,
        limit: Number(url.searchParams.get('limit') ?? 20),
        offset: Number(url.searchParams.get('offset') ?? 0),
      });
    }
    throw new Error(`Unexpected request: ${url.toString()}`);
  });
}

describe('Hub audit details and filters', () => {
  it('loads and renders the safe detail representation for an audit row', async () => {
    const fetcher = createFetcher();
    render(<AuditLogPage fetcher={fetcher} />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View details: Deployment succeeded',
      }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Audit event details' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Alice')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/alice@example\.com · user · member-1/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Inventory')).toBeInTheDocument();
    expect(within(dialog).getByText('deployment-1')).toBeInTheDocument();
    expect(within(dialog).getByText('request-1')).toBeInTheDocument();
    expect(within(dialog).getByText('Codex on Mac')).toBeInTheDocument();
    expect(within(dialog).getByText('credential-1')).toBeInTheDocument();
    expect(within(dialog).getByText('203.0.113.10')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/"checksum": "sha256:95b5799"/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/<img src=x onerror=alert\(1\)>/),
    ).toBeInTheDocument();
    expect(dialog.querySelector('img')).toBeNull();
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/audit-logs\/audit-1$/),
      expect.anything(),
    );
  });

  it('sends the additional filters to list, export, and paginated requests', async () => {
    const fetcher = createFetcher();
    render(<AuditLogPage fetcher={fetcher} />);

    expect(await screen.findByText('Deployment succeeded')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Actor ID'), {
      target: { value: 'member-1' },
    });
    fireEvent.change(screen.getByLabelText('Resource type'), {
      target: { value: 'deployment' },
    });
    fireEvent.change(screen.getByLabelText('Resource ID'), {
      target: { value: 'deployment-1' },
    });
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-08-24T08:30' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-08-25T18:45' },
    });

    const expectedFrom = new Date('2026-08-24T08:30').toISOString();
    const expectedTo = new Date('2026-08-25T18:45').toISOString();
    await waitFor(() => {
      expect(
        auditListUrls(fetcher).some((url) =>
          hasFilters(url, expectedFrom, expectedTo),
        ),
      ).toBe(true);
    });

    const exportLink = screen.getByRole('button', {
      name: 'Export audit CSV',
    });
    const exportUrl = new URL(
      exportLink.getAttribute('href') ?? '',
      'http://hub.test',
    );
    expect(hasFilters(exportUrl, expectedFrom, expectedTo)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => {
      expect(
        auditListUrls(fetcher).some(
          (url) =>
            url.searchParams.get('limit') === '20' &&
            url.searchParams.get('offset') === '20' &&
            hasFilters(url, expectedFrom, expectedTo),
        ),
      ).toBe(true);
    });
  });
});

function auditListUrls(fetcher: ReturnType<typeof createFetcher>): URL[] {
  return fetcher.mock.calls
    .map(([input]) => new URL(String(input), 'http://hub.test'))
    .filter((url) => url.pathname.endsWith('/audit-logs'));
}

function hasFilters(url: URL, from: string, to: string): boolean {
  return (
    url.searchParams.get('actorId') === 'member-1' &&
    url.searchParams.get('resource') === 'deployment' &&
    url.searchParams.get('resourceId') === 'deployment-1' &&
    url.searchParams.get('from') === from &&
    url.searchParams.get('to') === to
  );
}
