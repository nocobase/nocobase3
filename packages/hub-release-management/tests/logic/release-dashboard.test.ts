import { describe, expect, it } from 'vitest';

import {
  getReleaseAction,
  isReadinessBlocked,
  summarizeOverview,
} from '../../client/logic';
import type { AppReleaseOverview, ReleaseOverview } from '../../shared/types';

const app: AppReleaseOverview = {
  id: 'orders',
  name: 'Orders',
  basePath: '/orders',
  accessUrl: 'https://apps.example.com/orders/',
  activeReleaseId: 'release-v2',
  activeVersion: '2.0.0',
  state: 'active',
  desiredState: 'running',
  runtimeState: 'active',
  lifecycleError: null,
  releases: [
    release('release-v3', '3.0.0', '2026-08-18T03:00:00.000Z'),
    release('release-v2', '2.0.0', '2026-08-18T02:00:00.000Z'),
    release('release-v1', '1.0.0', '2026-08-18T01:00:00.000Z'),
  ],
};

describe('release dashboard logic', () => {
  it('distinguishes deploy, active, and rollback releases', () => {
    expect(getReleaseAction(app, app.releases[0])).toBe('deploy');
    expect(getReleaseAction(app, app.releases[1])).toBeNull();
    expect(getReleaseAction(app, app.releases[2])).toBe('rollback');
  });

  it('summarizes platform safeguards', () => {
    const overview: ReleaseOverview = {
      apps: [app],
      deployments: [
        {
          id: 'deployment-1',
          idempotencyKey: 'agent-run-1',
          appId: 'orders',
          releaseId: 'release-v3',
          kind: 'deploy',
          status: 'failed',
          changed: false,
          previousReleaseId: null,
          activeReleaseId: 'release-v2',
          activeVersion: '2.0.0',
          actor: { id: '1', name: 'Agent', role: 'root' },
          requestedAt: '2026-08-18T03:00:00.000Z',
          completedAt: '2026-08-18T03:00:01.000Z',
          error: { code: 'APP_READINESS_FAILED', message: 'returned 503' },
        },
      ],
      lifecycleOperations: [],
    };

    expect(summarizeOverview(overview)).toEqual({
      apps: 1,
      releases: 3,
      online: 1,
      blocked: 1,
      rollbackPoints: 1,
      awaitingApproval: 0,
    });
  });

  it('counts an idle persisted release as deployed', () => {
    expect(
      summarizeOverview({
        apps: [{ ...app, state: 'idle' }],
        deployments: [],
        lifecycleOperations: [],
      }).online,
    ).toBe(1);
  });

  it('does not describe infrastructure failures as readiness blocks', () => {
    expect(
      isReadinessBlocked({
        id: 'deployment-infra-failure',
        idempotencyKey: 'agent-run-infra',
        appId: 'orders',
        releaseId: 'release-v3',
        kind: 'deploy',
        status: 'failed',
        changed: false,
        previousReleaseId: null,
        activeReleaseId: 'release-v2',
        activeVersion: '2.0.0',
        actor: { id: '1', name: 'Agent', role: 'root' },
        requestedAt: '2026-08-18T03:00:00.000Z',
        completedAt: '2026-08-18T03:00:01.000Z',
        error: { code: 'APP_HOST_UNAVAILABLE', message: 'connection refused' },
      }),
    ).toBe(false);
  });
});

function release(id: string, version: string, createdAt: string) {
  return {
    appId: 'orders',
    id,
    version,
    createdAt,
    runtime: { healthPath: '/healthz' },
  };
}
