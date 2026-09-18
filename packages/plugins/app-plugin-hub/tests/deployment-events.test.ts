import { describe, expect, it } from 'vitest';
import {
  appendDeploymentEvent,
  deploymentFailureCode,
} from '../server/services/deployment-events.js';
import type { HubDeploymentEvent } from '../server/tokens.js';

describe('deployment event retention', () => {
  it('bounds retained events while keeping a monotonic cursor and terminal event', () => {
    let events: readonly HubDeploymentEvent[] = [];
    for (let i = 0; i < 80; i++)
      events = appendDeploymentEvent(events, {
        phase: i % 2 ? 'starting' : 'resolving',
        status: 'deploying',
      });
    events = appendDeploymentEvent(
      events,
      { phase: 'completed', status: 'failed' },
      'secret arbitrary host output',
    );
    expect(events).toHaveLength(64);
    expect(events[0]?.sequence).toBe(18);
    expect(events.at(-1)).toMatchObject({
      sequence: 81,
      status: 'failed',
      code: 'DEPLOYMENT_FAILED',
    });
    expect(JSON.stringify(events)).not.toContain('secret');
    expect(
      appendDeploymentEvent(events, { phase: 'completed', status: 'failed' }),
    ).toEqual(events);
  });
  it('preserves the failed execution phase after cleanup events', () => {
    const events = appendDeploymentEvent(
      [
        {
          sequence: 1,
          at: new Date().toISOString(),
          phase: 'starting',
          status: 'failed',
          failedPhase: 'starting',
        },
        {
          sequence: 2,
          at: new Date().toISOString(),
          phase: 'completed',
          status: 'deploying',
        },
      ],
      { phase: 'completed', status: 'failed' },
      'activation failed',
    );
    expect(events.at(-1)?.failedPhase).toBe('starting');
  });
  it('classifies diagnostics without returning credentials or control characters', () => {
    expect(
      deploymentFailureCode('ECONNREFUSED password=hidden\nTOKEN=hidden'),
    ).toBe('CONNECTION_REFUSED');
    expect(deploymentFailureCode('arbitrary config secret')).toBe(
      'INVALID_CONFIG',
    );
  });
});
