import { describe, expect, it } from 'vitest';
import type { ToolsEntity } from '@nocobase/ai-employee';

import { willInterruptToolCall } from '../server/agent/middleware/tools.js';

const tool = (
  execution: ToolsEntity['execution'],
  auto: boolean | undefined,
): ToolsEntity =>
  ({
    scope: 'GENERAL',
    execution,
    auto,
    definition: { name: 'test', description: 'test' },
  }) as ToolsEntity;

describe('willInterruptToolCall', () => {
  it.each([
    ['backend', true, false],
    ['backend', false, true],
    ['backend', undefined, false],
    ['frontend', true, true],
    ['frontend', false, true],
    ['frontend', undefined, true],
  ] as const)('returns %s/%s -> %s', (execution, auto, expected) => {
    expect(willInterruptToolCall(tool(execution, auto))).toBe(expected);
  });

  it('does not interrupt unknown tools', () => {
    expect(willInterruptToolCall()).toBe(false);
  });
});
