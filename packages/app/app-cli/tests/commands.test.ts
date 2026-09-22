import { describe, expect, it, vi } from 'vitest';
import { createAppCommands } from '../src/index.js';

describe('application command factories', () => {
  it('keeps application contexts separate and does not resolve runtime during registration', () => {
    const loadRuntime = vi.fn();
    const first = createAppCommands({ rootDir: '/first', loadRuntime });
    const second = createAppCommands({
      rootDir: '/second',
      loadRuntime,
      publishing: true,
    });
    expect(first.info).not.toBe(second.info);
    expect(first).not.toHaveProperty('deploy');
    expect(second).toHaveProperty('deploy');
    expect(loadRuntime).not.toHaveBeenCalled();
    expect(Object.keys(first)).toEqual([
      'info',
      'db:apply',
      'db:reset',
      'db:repair',
      'collections:generate',
      'i18n:check',
    ]);
  });
});
