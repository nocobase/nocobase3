import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import {
  Locator,
  createQueueManager,
  createSyncQueueConfig,
} from '../src/index.js';

it.each([false, true])(
  'loads, registers and executes TypeScript jobs (strict=%s)',
  async (strictJobLoading) => {
    const record = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = createQueueManager(
      {
        ...createSyncQueueConfig(),
        jobs: {
          autoLoad: true,
          locations: [
            fileURLToPath(
              new URL('./fixtures/discovered-job.ts', import.meta.url),
            ),
          ],
        },
      },
      { strictJobLoading, jobFactory: (JobClass) => new JobClass(record) },
    );
    try {
      await manager.init();
      const JobClass = Locator.getOrThrow('DiscoveredParameterPropertyJob');
      await JobClass.dispatch({ value: 'executed' }).run();
      expect(record).toHaveBeenCalledWith('executed');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      await manager.close();
      Locator.clear();
      warn.mockRestore();
    }
  },
);
