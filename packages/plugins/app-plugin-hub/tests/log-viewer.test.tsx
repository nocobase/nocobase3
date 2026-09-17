import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { request, client } = vi.hoisted(() => {
  const request = vi.fn();
  return { request, client: { request } };
});
vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => client,
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
import { LogViewer } from '../client/pages/hub/log-viewer.js';
beforeEach(() => request.mockReset());
afterEach(() => vi.restoreAllMocks());
it('shows a persisted deployment error and sends filters to the deployment endpoint', async () => {
  request.mockResolvedValue({
    data: {
      entries: [
        {
          time: '2026-09-17',
          level: 'error',
          msg: 'Initialization failed',
          err: { stack: 'Error: invalid secret\n at initialize' },
        },
      ],
      cursor: 'cursor',
      available: true,
      hasMore: false,
      enabled: true,
      status: 'failed',
    },
  });
  render(<LogViewer appId='app2' deploymentId='deployment-1' />);
  await screen.findByText(/Initialization failed/, { selector: 'summary' });
  expect(request.mock.calls[0]?.[0].path).toBe(
    'hub/apps/app2/deployments/deployment-1/logs',
  );
  fireEvent.change(screen.getByLabelText('logs.level'), {
    target: { value: 'error' },
  });
  await waitFor(() =>
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ level: 'error' }),
      }),
    ),
  );
});
it('distinguishes unavailable collection from an empty filtered result', async () => {
  request.mockResolvedValue({
    data: {
      entries: [],
      cursor: '',
      available: false,
      hasMore: false,
      enabled: true,
      status: 'succeeded',
    },
  });
  render(<LogViewer appId='app2' deploymentId='old-deployment' />);
  await screen.findByText('logs.unavailable');
});

function logPage(
  entries: Array<{ time: string; msg: string; logId: string }>,
  extra = {},
): object {
  return {
    data: {
      entries: entries.map((entry) => ({ ...entry, level: 'info' })),
      cursor: 'next',
      available: true,
      hasMore: false,
      enabled: true,
      reset: false,
      status: 'succeeded',
      ...extra,
    },
  };
}

it('keeps paged history ordered and deduplicated and replaces entries after a reset', async () => {
  const first = { time: '2026-09-17T12:00:00Z', msg: 'First', logId: 'first' };
  const earlier = {
    time: '2026-09-16T12:00:00Z',
    msg: 'Earlier',
    logId: 'earlier',
  };
  request
    .mockResolvedValueOnce(logPage([]))
    .mockResolvedValueOnce(logPage([first], { hasMore: true }))
    .mockResolvedValueOnce(logPage([earlier, first], { hasMore: true }))
    .mockResolvedValueOnce(
      logPage([{ ...first, msg: 'Restarted scan', logId: 'new' }], {
        reset: true,
      }),
    );
  const { container } = render(
    <LogViewer appId='app2' deploymentId='deployment-1' />,
  );
  await screen.findByText('logs.empty');
  fireEvent.click(screen.getByText('logs.history'));
  await screen.findByText(/First/, { selector: 'summary' });
  fireEvent.click(screen.getByText('logs.next'));
  await screen.findByText(/Earlier/, { selector: 'summary' });
  expect(
    [...container.querySelectorAll('summary')].map(
      (element) => element.textContent,
    ),
  ).toEqual([
    expect.stringContaining('Earlier'),
    expect.stringContaining('First'),
  ]);
  fireEvent.click(screen.getByText('logs.next'));
  await screen.findByText(/Restarted scan/, { selector: 'summary' });
  expect(container.querySelectorAll('summary')).toHaveLength(1);
  expect(screen.getByText('logs.rotated')).toBeInTheDocument();
});

it('continues an empty history scan and pauses after finding records', async () => {
  request
    .mockResolvedValueOnce(logPage([]))
    .mockResolvedValueOnce(logPage([], { hasMore: true }))
    .mockResolvedValueOnce(
      logPage(
        [{ time: '2026-09-17', msg: 'Matching record', logId: 'match' }],
        { hasMore: true },
      ),
    );
  render(<LogViewer appId='app2' deploymentId='deployment-1' />);
  await screen.findByText('logs.empty');
  fireEvent.click(screen.getByText('logs.history'));
  await screen.findByText(/Matching record/, { selector: 'summary' });
  expect(request).toHaveBeenCalledTimes(3);
  expect(screen.getByText('logs.next')).toBeInTheDocument();
});

it('downloads every page with a stable time boundary and rejects a reset during export', async () => {
  const record = {
    time: '2026-09-17',
    msg: 'First export record',
    logId: 'first',
  };
  request
    .mockResolvedValueOnce(logPage([]))
    .mockResolvedValueOnce(
      logPage([record], { hasMore: true, cursor: 'download-next' }),
    )
    .mockResolvedValueOnce(
      logPage([{ ...record, msg: 'Second export record', logId: 'second' }]),
    )
    .mockResolvedValueOnce(logPage([record], { reset: true }));
  let downloaded: Blob | undefined;
  const create = vi.fn((blob: Blob) => {
    downloaded = blob;
    return 'blob:test';
  });
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = create;
      static override revokeObjectURL = vi.fn();
    },
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {});
  try {
    render(<LogViewer appId='app2' deploymentId='deployment-1' />);
    await screen.findByText('logs.empty');
    fireEvent.click(screen.getByText('logs.download'));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(downloaded?.size).toBeGreaterThan(100);
    expect(request.mock.calls[2]?.[0].query).toMatchObject({
      cursor: 'download-next',
      fromStart: true,
      until: request.mock.calls[1]?.[0].query.until,
    });
    fireEvent.click(screen.getByText('logs.download'));
    await screen.findByText('logs.downloadChanged');
    expect(click).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
