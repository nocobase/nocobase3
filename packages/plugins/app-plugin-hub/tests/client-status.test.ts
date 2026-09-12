import { describe, expect, it } from 'vitest';

import {
  appActionState,
  appManagementStatus,
  readError,
} from '../client/pages/hub/utils.js';
import type { AppOverview, AppSummary } from '../client/pages/hub/types.js';

const summary = (overrides: Partial<AppSummary> = {}): AppSummary => ({
  app: {
    id: 'customer',
    name: 'Customer',
    currentDeploymentId: 'deployment-1',
    updatedAt: '2026-09-11T00:00:00Z',
  },
  runtime: { hostAvailable: true, state: 'stopped' },
  currentVersion: '1.0.0',
  hasReleases: true,
  hasPendingDeployment: false,
  enabled: false,
  startupMode: 'eager',
  ...overrides,
});

describe('Hub App status and action mapping', () => {
  it('prioritizes Host and deployment state over runtime state', () => {
    expect(
      appManagementStatus(
        summary({
          runtime: { hostAvailable: false, state: 'running' },
        }),
      ),
    ).toBe('host-unavailable');
    expect(
      appManagementStatus(
        summary({
          hasPendingDeployment: true,
          runtime: { hostAvailable: true, state: 'running' },
        }),
      ),
    ).toBe('deployment-pending');
  });

  it('distinguishes lazy Ready from a user-stopped App', () => {
    expect(
      appManagementStatus(
        summary({
          enabled: true,
          startupMode: 'lazy',
          runtime: { hostAvailable: true, state: 'stopped' },
        }),
      ),
    ).toBe('ready');
    expect(appManagementStatus(summary())).toBe('stopped');
  });

  it('does not treat an unknown runtime as lazy Ready', () => {
    expect(
      appManagementStatus(
        summary({
          enabled: true,
          startupMode: 'lazy',
          runtime: { hostAvailable: true, state: 'unknown' },
        }),
      ),
    ).toBe('unknown');
  });

  it('explains lifecycle action availability', () => {
    expect(
      appActionState(
        summary({ app: { ...summary().app, currentDeploymentId: null } }),
        'start',
      ),
    ).toEqual({
      enabled: false,
      reason: 'deployReleaseFirst',
    });
    expect(
      appActionState(
        summary({ runtime: { hostAvailable: false, state: 'stopped' } }),
        'stop',
      ),
    ).toEqual({ enabled: false, reason: 'hostUnavailable' });
    expect(
      appActionState(
        summary({ runtime: { hostAvailable: true, state: 'running' } }),
        'stop',
      ),
    ).toEqual({ enabled: true });
    expect(
      appActionState(
        summary({ runtime: { hostAvailable: true, state: 'running' } }),
        'restart',
        true,
      ),
    ).toEqual({ enabled: false, reason: 'operationInProgress' });
  });

  it('supports detail responses with the same mapping', () => {
    const detail = {
      ...summary(),
      deployment: {
        desiredReleaseId: 'release-1',
        observedReleaseId: 'release-1',
        observedState: 'stopped',
        activation: 'lazy',
        basePath: '/customer',
        updatedAt: '2026-09-11T00:00:00Z',
      },
      releases: [],
      deployments: [],
      hostUrl: null,
    } as unknown as AppOverview;
    expect(appManagementStatus(detail)).toBe('stopped');
  });

  it('turns JSON API failures into readable details without exposing paths', () => {
    const error = readError(
      JSON.stringify({
        error: {
          code: 'INVALID_ARTIFACT',
          message:
            "Invalid release artifact: ENOENT: no such file or directory, lstat '/var/folders/example/package.json'",
        },
      }),
    );

    expect(error).toMatchObject({
      code: 'INVALID_ARTIFACT',
      isTechnical: true,
      message: 'The operation could not be completed.',
    });
    expect(error.technicalMessage).toContain('INVALID_ARTIFACT');
    expect(error.technicalMessage).toContain(
      '/var/folders/example/package.json',
    );
    expect(error.message).not.toContain('/var/folders/example/package.json');
  });

  it('recognizes deployment version mismatches as technical details', () => {
    const error = readError(
      'Artifact version mismatch for app "ts": expected "1.0.0-beta.22", received "local"',
    );

    expect(error).toMatchObject({
      code: 'ARTIFACT_VERSION_MISMATCH',
      isTechnical: true,
      message: 'The operation could not be completed.',
    });
  });

  it('keeps ordinary user-facing errors readable', () => {
    expect(readError(new Error('Application name is required'))).toMatchObject({
      isTechnical: false,
      message: 'Application name is required',
      technicalMessage: 'Application name is required',
    });
  });
});
