import { Job } from '@boringnode/queue';
import { describe, expect, it } from 'vitest';

import { createQueueJobFactoryRegistry } from '../src/types.js';

class DefaultJob extends Job {}
class SpecialJob extends Job {
  public static options = { name: 'special' };
}

describe('Queue Job factory registry', () => {
  it('uses a named factory without exposing the application container to jobs', async () => {
    const fallback = new DefaultJob();
    const special = new SpecialJob();
    const registry = createQueueJobFactoryRegistry(() => fallback);
    registry.register('special', () => special);

    await expect(Promise.resolve(registry.create(DefaultJob))).resolves.toBe(
      fallback,
    );
    await expect(Promise.resolve(registry.create(SpecialJob))).resolves.toBe(
      special,
    );
    expect(() => registry.register('special', () => special)).toThrow(
      'already registered',
    );

    registry.unregister('special');
    await expect(Promise.resolve(registry.create(SpecialJob))).resolves.toBe(
      fallback,
    );
  });
});
