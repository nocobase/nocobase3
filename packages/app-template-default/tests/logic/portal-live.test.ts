// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createMemoryPortalLivePublisher } from '../../registry/portal-live/server/index.ts';

describe('Portal Live memory publisher', () => {
  it('isolates streams by application and user and replays after a cursor', () => {
    const publisher = createMemoryPortalLivePublisher();
    const received: string[] = [];
    publisher.subscribe('main', 'user-1', (event) => received.push(event.type));
    const first = publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'created', payload: { ids: ['item-1'] } });
    publisher.publish({ appId: 'main', userId: 'user-2', channel: 'notifications/inbox', type: 'created', payload: { ids: ['item-2'] } });
    const second = publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'unread-count-changed', payload: {} });

    expect(received).toEqual(['created', 'unread-count-changed']);
    expect(publisher.replay('main', 'user-1', { streamId: first.streamId, sequence: first.sequence })).toMatchObject({ kind: 'events', events: [{ sequence: second.sequence }] });
    expect(publisher.replay('main', 'user-2', { streamId: first.streamId, sequence: first.sequence }).kind).toBe('resync_required');
  });

  it('requests HTTP resynchronization when the cursor falls outside the replay window', () => {
    const publisher = createMemoryPortalLivePublisher({ maxEvents: 2 });
    const first = publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'created', payload: {} });
    publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'updated', payload: {} });
    publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'deleted', payload: {} });

    expect(publisher.replay('main', 'user-1', { streamId: first.streamId, sequence: first.sequence - 1 }).kind).toBe('resync_required');
  });
});
