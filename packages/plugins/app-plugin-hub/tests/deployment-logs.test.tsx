import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeploymentLogs } from '../client/pages/hub/deployment-logs.js';
import type { DeploymentRecord } from '../client/pages/hub/types.js';
const client = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@nocobase/app-client', () => ({
  useApiClient: () => client,
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
    i18n: { language: 'en-US' },
  }),
}));
const deployment: DeploymentRecord = {
  id: 'deploy-1',
  releaseId: 'release-1',
  release: { version: '1.0.0', checksum: 'abc' },
  kind: 'deploy',
  status: 'queued',
  phase: 'queued',
  config: { mode: 'external' },
  cacheHit: null,
  error: null,
  createdAt: '2026-09-17T00:00:00Z',
};
const event = {
  sequence: 1,
  at: '2026-09-17T00:00:00Z',
  phase: 'queued',
  status: 'queued',
};
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('deployment log drawer', () => {
  it('loads incrementally and stops polling when the operation ends', async () => {
    vi.useFakeTimers();
    client.request
      .mockResolvedValueOnce({
        data: {
          items: [event],
          nextCursor: 1,
          status: 'queued',
          legacy: false,
          truncated: false,
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            { ...event, sequence: 2, phase: 'completed', status: 'succeeded' },
          ],
          nextCursor: 2,
          status: 'succeeded',
          legacy: false,
          truncated: false,
        },
      });
    const view = render(
      <DeploymentLogs
        appId='customer'
        deployment={deployment}
        onClose={() => undefined}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(client.request).toHaveBeenCalledWith({
      path: 'hub/apps/customer/deployments/deploy-1/logs',
      query: { after: 0 },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(client.request).toHaveBeenLastCalledWith({
      path: 'hub/apps/customer/deployments/deploy-1/logs',
      query: { after: 1 },
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(client.request).toHaveBeenCalledTimes(2);
    view.unmount();
  });
  it('stops polling when closed and offers a retry on failure', async () => {
    client.request
      .mockRejectedValueOnce(new Error('Forbidden'))
      .mockResolvedValue({
        data: {
          items: [],
          nextCursor: 0,
          status: 'queued',
          legacy: false,
          truncated: false,
        },
      });
    const view = render(
      <DeploymentLogs
        appId='customer'
        deployment={deployment}
        onClose={() => undefined}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load logs',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    vi.useFakeTimers();
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(client.request).toHaveBeenCalledTimes(2);
  });
  it('cancels scheduled requests when the drawer is unmounted', async () => {
    vi.useFakeTimers();
    client.request.mockResolvedValue({
      data: {
        items: [event],
        nextCursor: 1,
        status: 'queued',
        legacy: false,
        truncated: false,
      },
    });
    const view = render(
      <DeploymentLogs
        appId='customer'
        deployment={deployment}
        onClose={() => undefined}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('shows execution details directly and hides coarse progress duplicates', async () => {
    client.request.mockResolvedValue({
      data: {
        items: [
          event,
          { ...event, sequence: 2, phase: 'starting', status: 'deploying' },
          {
            ...event,
            sequence: 3,
            phase: 'extracting',
            status: 'deploying',
            message: 'Extracting archive',
            durationMs: 2,
          },
          {
            ...event,
            sequence: 4,
            phase: 'extracting',
            status: 'deploying',
            message: 'Archive ready',
            durationMs: 3,
          },
          { ...event, sequence: 5, phase: 'completed', status: 'succeeded' },
        ],
        nextCursor: 5,
        status: 'succeeded',
        legacy: false,
        truncated: false,
      },
    });
    render(
      <DeploymentLogs
        appId='customer'
        deployment={deployment}
        onClose={() => undefined}
      />,
    );
    await screen.findByText(/Archive ready/);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText(/Extracting archive/)).toBeVisible();
    expect(screen.getByText(/Archive ready/)).toBeVisible();
    expect(screen.getByText('(3 ms)')).toBeVisible();
    expect(document.querySelector('details')).toBeNull();
  });

  it.each([true, false])(
    'keeps one failure entry with details present: %s',
    async (withDetails) => {
      client.request.mockResolvedValue({
        data: {
          items: [
            ...(withDetails
              ? [
                  {
                    ...event,
                    sequence: 1,
                    phase: 'starting',
                    status: 'failed',
                    message: 'Candidate initialization failed.',
                  },
                ]
              : []),
            {
              ...event,
              sequence: 2,
              phase: 'completed',
              status: 'failed',
              failedPhase: 'starting',
              code: 'DEPLOYMENT_FAILED',
            },
          ],
          nextCursor: 2,
          status: 'failed',
          legacy: false,
          truncated: false,
        },
      });
      render(
        <DeploymentLogs
          appId='customer'
          deployment={deployment}
          onClose={() => undefined}
        />,
      );
      await screen.findByText(/DEPLOYMENT_FAILED/);
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
      expect(
        screen.queryByText(/restricted Host logs/),
      ).not.toBeInTheDocument();
      if (withDetails) {
        expect(
          screen.getByText(/Candidate initialization failed/),
        ).toBeVisible();
        expect(
          screen.queryByText(/No further details/),
        ).not.toBeInTheDocument();
      } else {
        expect(screen.getByText(/No further details/)).toBeVisible();
      }
    },
  );

  it('explains missing legacy logs', async () => {
    client.request.mockResolvedValue({
      data: {
        items: [],
        nextCursor: 0,
        status: 'failed',
        legacy: true,
        truncated: false,
      },
    });
    render(
      <DeploymentLogs
        appId='customer'
        deployment={deployment}
        onClose={() => undefined}
      />,
    );
    expect(
      await screen.findByText(
        'This deployment predates log collection. No historical events are available.',
      ),
    ).toBeInTheDocument();
  });
});
