import { describe, expect, it, vi } from 'vitest';
import {
  ServiceContainer,
  createServiceToken,
} from '@nocobase/service-provider';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { idGeneratorToken } from '../src/id-generator/token.js';
import { createTaskServiceResolver } from '../src/database/task-container.js';

describe('database task service resolver', () => {
  it('shares the application singleton without eagerly creating it', () => {
    const source = new ServiceContainer();
    const factory = vi.fn(() => new SnowflakeIdGenerator({ workerId: 0 }));
    source.singleton(idGeneratorToken, factory);
    const tasks = createTaskServiceResolver(source);
    expect(tasks.has(idGeneratorToken)).toBe(true);
    expect(tasks.resolveIfCreated(idGeneratorToken)).toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
    const ids = tasks.resolve(idGeneratorToken);
    expect(ids).toBe(source.resolve(idGeneratorToken));
    expect(tasks.resolveIfCreated(idGeneratorToken)).toBe(ids);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(Object.keys(tasks).sort()).toEqual([
      'has',
      'resolve',
      'resolveIfCreated',
    ]);
  });

  it('rejects unapproved and same-name tokens without touching the source', () => {
    const source = new ServiceContainer();
    const tokens = [
      createServiceToken('business'),
      createServiceToken(idGeneratorToken.name),
    ];
    const factory = vi.fn(() => ({}));
    for (const token of tokens) source.singleton(token, factory);
    const tasks = createTaskServiceResolver(source);
    for (const token of tokens) {
      expect(tasks.has(token)).toBe(false);
      expect(() => tasks.resolve(token)).toThrow('not allowed');
      expect(() => tasks.resolveIfCreated(token)).toThrow('not allowed');
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it('reports allowed but unavailable services clearly', () => {
    const tasks = createTaskServiceResolver();
    expect(tasks.has(idGeneratorToken)).toBe(false);
    expect(tasks.resolveIfCreated(idGeneratorToken)).toBeUndefined();
    expect(() => tasks.resolve(idGeneratorToken)).toThrow('not registered');
  });
});
