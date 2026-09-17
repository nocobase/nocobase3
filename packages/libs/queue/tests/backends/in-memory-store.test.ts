import { describe, expect, it } from 'vitest';
import { createInMemoryStoreRegistry } from '../../src/backends/in-memory/store.js';

describe('private memory queue stores', () => {
  it('shares one store per physical identity in one registry only', () => {
    const a = createInMemoryStoreRegistry();
    const b = createInMemoryStoreRegistry();
    expect(a('__proto__')).toBe(a('__proto__'));
    expect(a('queue')).not.toBe(a('Queue'));
    expect(a('queue')).not.toBe(b('queue'));
    a('queue').add({ id: 'job', name: 'event', data: {} });
    expect(b('queue').get('job')).toBeUndefined();
  });

  it('stores JSON once and returns defensive record copies', () => {
    const store = createInMemoryStoreRegistry()('jobs');
    let calls = 0;
    const input = {
      toJSON: () => {
        calls++;
        return { value: 1 };
      },
    };
    const record = store.add({
      id: 'id',
      name: 'channel',
      data: input,
      options: { attempts: 3 },
    });
    record.options.attempts = 100;
    record.state = 'failed';
    expect(calls).toBe(1);
    expect(store.get('id')).toMatchObject({
      data: '{"value":1}',
      state: 'waiting',
      options: { attempts: 3 },
    });
    expect(calls).toBe(1);
  });

  it.each([undefined, null, '\u0000', '\ud800', [1, undefined]])(
    'normalizes JSON value %j',
    (data) => {
      const store = createInMemoryStoreRegistry()('jobs');
      const result = store.add({ name: 'event', data });
      expect(result.data).toBe(JSON.stringify(data === undefined ? {} : data));
    },
  );

  it('rejects unserializable data without creating a record', () => {
    const store = createInMemoryStoreRegistry()('jobs');
    const circular: { self?: unknown } = {};
    circular.self = circular;
    for (const data of [1n, circular, () => {}, Symbol('job')]) {
      expect(() => store.add({ id: 'bad', name: 'event', data })).toThrow();
      expect(store.get('bad')).toBeUndefined();
    }
  });

  it('preserves original records on duplicate IDs and creates unique default IDs', () => {
    const store = createInMemoryStoreRegistry()('jobs');
    const first = store.add({ id: 'same', name: 'first', data: 1 });
    expect(store.add({ id: 'same', name: 'second', data: 2 })).toEqual(first);
    const ids = Array.from(
      { length: 100 },
      () => store.add({ name: 'event', data: {} }).id,
    );
    expect(new Set(ids).size).toBe(100);
  });

  it.each(['completed', 'failed'] as const)(
    'tracks waiting, active and %s with compare-and-set',
    (terminal) => {
      const store = createInMemoryStoreRegistry()('jobs');
      const { id } = store.add({ name: 'event', data: {} });
      expect(store.transition(id, 'waiting', 'active')).toBe(true);
      expect(store.transition(id, 'waiting', terminal)).toBe(false);
      expect(store.get(id)?.state).toBe('active');
      expect(store.transition(id, 'active', terminal)).toBe(true);
      expect(store.get(id)?.state).toBe(terminal);
      expect(store.transition('absent', 'waiting', 'active')).toBe(false);
    },
  );
});
