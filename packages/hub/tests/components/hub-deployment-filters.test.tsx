import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { DeploymentsPage } from '@/pages/deployments/list';

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
    requestId: 'deployment-filter-test',
  });
}

function createFetcher() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input), 'http://hub.test');
    if (url.pathname.endsWith('/apps')) {
      return response([
        {
          id: 'app-1',
          slug: 'inventory',
          name: 'Inventory',
        },
      ]);
    }
    if (url.pathname.endsWith('/deployments')) {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return response(
        Array.from({ length: 20 }, (_, index) => ({
          id: `deployment-${offset + index + 1}`,
          applicationId: 'app-1',
          environmentId: 'default',
          targetReleaseId: 'release-1',
          previousReleaseId: null,
          type: 'rollback',
          status: 'failed',
          requestedBy: 'member-1',
          startedAt: '2026-08-25T01:00:00.000Z',
          finishedAt: '2026-08-25T01:02:00.000Z',
          createdAt: '2026-08-25T00:59:00.000Z',
        })),
        { total: 45, limit: 20, offset },
      );
    }
    throw new Error(`Unexpected request: ${url.toString()}`);
  });
}

describe('Hub deployment list filters', () => {
  it('applies all deployment filters, resets the page, and preserves them when paging', async () => {
    const fetcher = createFetcher();
    render(
      <MemoryRouter>
        <DeploymentsPage fetcher={fetcher} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() => {
      expect(
        deploymentUrls(fetcher).some(
          (url) => url.searchParams.get('offset') === '20',
        ),
      ).toBe(true);
    });

    fireEvent.change(await screen.findByLabelText('Filter by application'), {
      target: { value: 'app-1' },
    });
    fireEvent.change(
      await screen.findByLabelText('Filter by deployment status'),
      {
        target: { value: 'failed' },
      },
    );
    fireEvent.change(
      await screen.findByLabelText('Filter by deployment type'),
      {
        target: { value: 'rollback' },
      },
    );
    fireEvent.change(await screen.findByLabelText('Requested by'), {
      target: { value: 'member-1' },
    });
    fireEvent.change(await screen.findByLabelText('From'), {
      target: { value: '2026-08-24T08:30' },
    });
    fireEvent.change(await screen.findByLabelText('To'), {
      target: { value: '2026-08-25T18:45' },
    });
    fireEvent.change(await screen.findByLabelText('Sort deployments'), {
      target: { value: '-finishedAt' },
    });

    const expectedFrom = new Date('2026-08-24T08:30').toISOString();
    const expectedTo = new Date('2026-08-25T18:45').toISOString();
    await waitFor(() => {
      expect(
        deploymentUrls(fetcher).some(
          (url) =>
            !url.searchParams.has('offset') &&
            hasFilters(url, expectedFrom, expectedTo),
        ),
      ).toBe(true);
    });

    const exportLink = screen.getByRole('button', {
      name: 'Export deployment CSV',
    });
    const exportUrl = new URL(
      exportLink.getAttribute('href') ?? '',
      'http://hub.test',
    );
    expect(exportUrl.pathname).toBe('/hub/api/deployments.csv');
    expect(hasFilters(exportUrl, expectedFrom, expectedTo)).toBe(true);
    expect(exportUrl.searchParams.has('limit')).toBe(false);
    expect(exportUrl.searchParams.has('offset')).toBe(false);

    const nextPage = screen.getByRole('button', { name: 'Next page' });
    await waitFor(() => expect(nextPage).toBeEnabled());
    fireEvent.click(nextPage);

    await waitFor(() => {
      expect(
        deploymentUrls(fetcher).some(
          (url) =>
            url.searchParams.get('limit') === '20' &&
            url.searchParams.get('offset') === '20' &&
            hasFilters(url, expectedFrom, expectedTo),
        ),
      ).toBe(true);
    });
  });
});

function deploymentUrls(fetcher: ReturnType<typeof createFetcher>): URL[] {
  return fetcher.mock.calls
    .map(([input]) => new URL(String(input), 'http://hub.test'))
    .filter((url) => url.pathname.endsWith('/deployments'));
}

function hasFilters(url: URL, from: string, to: string): boolean {
  return (
    url.searchParams.get('applicationId') === 'app-1' &&
    url.searchParams.get('status') === 'failed' &&
    url.searchParams.get('type') === 'rollback' &&
    url.searchParams.get('requestedBy') === 'member-1' &&
    url.searchParams.get('from') === from &&
    url.searchParams.get('to') === to &&
    url.searchParams.get('sort') === '-finishedAt'
  );
}
