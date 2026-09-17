import { createQueueService } from '@nocobase/queue';
import { expect, it } from 'vitest';
import { createWorkflowQueueAdapter } from '../server/queue.js';

it('isolates same-name workflow dispatchers in separate application queue services', async () => {
  const first = createQueueService({ namespace: 'first-app' });
  const second = createQueueService({ namespace: 'second-app' });
  const received: number[][] = [[], []];
  const adapters: ReturnType<typeof createWorkflowQueueAdapter>[] = [];
  try {
    for (const [index, queue] of [first, second].entries()) {
      adapters.push(
        createWorkflowQueueAdapter({
          queue,
          dispatch: async (task) => {
            received[index]!.push(Number(task.executionId));
          },
        }),
      );
    }
    expect(received).toEqual([[], []]);
    await Promise.all([first.setup(), second.setup()]);
    await adapters[0]!.publish({ executionId: 1, nodeRunId: 11 });
    await adapters[1]!.publish({ executionId: 2, nodeRunId: 22 });
    await expect.poll(() => received).toEqual([[1], [2]]);
    await adapters[0]!.stop();
    await adapters[1]!.publish({ executionId: 3, nodeRunId: 33 });
    await expect.poll(() => received[1]).toEqual([2, 3]);
  } finally {
    await Promise.all(adapters.map((adapter) => adapter.stop()));
    await Promise.all([first.shutdown(), second.shutdown()]);
  }
});
