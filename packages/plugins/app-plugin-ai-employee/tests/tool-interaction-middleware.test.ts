import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ humanInTheLoopMiddleware: vi.fn() }));

vi.mock('langchain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('langchain')>();
  return {
    ...actual,
    humanInTheLoopMiddleware: mocks.humanInTheLoopMiddleware,
  };
});

import { toolInteractionMiddleware } from '../server/agent/middleware/tools.js';

describe('toolInteractionMiddleware', () => {
  it('builds interrupt policy from the supplied tool map', () => {
    mocks.humanInTheLoopMiddleware.mockImplementation((options) => options);
    const toolMap = new Map([
      [
        'automatic',
        {
          scope: 'GENERAL',
          execution: 'backend',
          auto: true,
          definition: { name: 'automatic' },
        },
      ],
      [
        'review',
        {
          scope: 'GENERAL',
          execution: 'backend',
          auto: false,
          definition: { name: 'review' },
        },
      ],
      [
        'frontend',
        {
          scope: 'GENERAL',
          execution: 'frontend',
          auto: true,
          definition: { name: 'frontend' },
        },
      ],
    ]);

    toolInteractionMiddleware(
      {
        identity: { sessionId: 'session-1', username: 'dara' },
      } as never,
      toolMap,
    );

    const interruptOn =
      mocks.humanInTheLoopMiddleware.mock.calls[0]?.[0].interruptOn;
    expect(interruptOn.automatic).toBe(false);
    expect(interruptOn.review).toMatchObject({
      allowedDecisions: ['approve', 'reject', 'edit'],
    });
    expect(interruptOn.frontend).toMatchObject({
      allowedDecisions: ['approve', 'reject', 'edit'],
    });
  });
});
