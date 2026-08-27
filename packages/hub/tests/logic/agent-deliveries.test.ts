import { describe, expect, it } from 'vitest';

import {
  buildAgentDeliveries,
  filterAgentDeliveries,
  summarizeAgentDeliveries,
} from '../../client/features/deliveries/logic';
import type { ReleaseOverview } from '@nocobase/hub-release-management/types';

describe('Agent delivery projection', () => {
  it('projects real releases and approval records into the delivery lifecycle', () => {
    const deliveries = buildAgentDeliveries(overview);

    expect(
      deliveries.map((delivery) => [delivery.release.id, delivery.stage]),
    ).toEqual([
      ['release-v3', 'pending-approval'],
      ['release-v2', 'online'],
      ['release-v1', 'historical'],
    ]);
    expect(
      deliveries.find((delivery) => delivery.stage === 'online')?.approvalCheck,
    ).toBe('passed');
    expect(summarizeAgentDeliveries(deliveries)).toEqual({
      total: 3,
      needsAttention: 1,
      executing: 0,
      online: 1,
      failed: 0,
    });
    expect(
      filterAgentDeliveries(deliveries, 'attention').map(
        (delivery) => delivery.release.id,
      ),
    ).toEqual(['release-v3']);
    expect(
      filterAgentDeliveries(deliveries, 'history').map(
        (delivery) => delivery.release.id,
      ),
    ).toEqual(['release-v1']);
  });

  it('surfaces failed delivery checks without treating the release as online', () => {
    const deliveries = buildAgentDeliveries({
      ...overview,
      approvals: [
        {
          ...overview.approvals![0],
          status: 'failed',
          error: {
            code: 'APP_READINESS_FAILED',
            message: 'returned 503',
          },
        },
      ],
      deployments: [
        {
          id: 'deployment-v3',
          idempotencyKey: 'approval-v3',
          appId: 'crm',
          releaseId: 'release-v3',
          kind: 'deploy',
          status: 'failed',
          changed: false,
          previousReleaseId: 'release-v2',
          activeReleaseId: 'release-v2',
          activeVersion: '2.0.0',
          actor: { id: 'manager', name: '发布管理员', role: 'admin' },
          requestedAt: '2026-08-24T10:02:00.000Z',
          completedAt: '2026-08-24T10:02:02.000Z',
          error: {
            code: 'APP_READINESS_FAILED',
            message: 'returned 503',
          },
        },
      ],
    });
    const failed = deliveries.find(
      (delivery) => delivery.release.id === 'release-v3',
    );

    expect(failed).toMatchObject({
      stage: 'failed',
      readinessCheck: 'failed',
      trafficCheck: 'waiting',
    });
  });
});

const overview: ReleaseOverview = {
  apps: [
    {
      id: 'crm',
      name: 'CRM',
      basePath: '/crm',
      accessUrl: '/crm/',
      activeReleaseId: 'release-v2',
      activeVersion: '2.0.0',
      state: 'active',
      resources: [],
      releases: [
        release('release-v3', '3.0.0', '2026-08-24T10:00:00.000Z'),
        release('release-v2', '2.0.0', '2026-08-24T09:00:00.000Z'),
        release('release-v1', '1.0.0', '2026-08-24T08:00:00.000Z'),
      ],
    },
  ],
  deployments: [],
  approvals: [
    {
      id: 'approval-v3',
      idempotencyKey: 'agent-task-v3',
      appId: 'crm',
      releaseId: 'release-v3',
      kind: 'deploy',
      status: 'pending',
      requestedBy: { id: 'agent', name: 'CRM Agent', role: 'agent' },
      requestedAt: '2026-08-24T10:01:00.000Z',
      decidedBy: null,
      decidedAt: null,
      decisionComment: null,
      deploymentId: null,
      error: null,
    },
  ],
};

function release(id: string, version: string, createdAt: string) {
  return {
    appId: 'crm',
    id,
    version,
    createdAt,
    runtime: { healthPath: '/healthz' },
  };
}
