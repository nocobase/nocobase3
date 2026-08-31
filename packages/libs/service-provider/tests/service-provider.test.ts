import { describe, expect, it } from 'vitest';

import {
  createServiceToken,
  ServiceContainer,
  ServiceProvider,
  ServiceProviderRegistry,
} from '../src/index.js';

describe('service container', () => {
  it('resolves instances and creates singleton factories once', () => {
    const container = new ServiceContainer();
    const instanceToken = createServiceToken<{ value: number }>('instance');
    const singletonToken = createServiceToken<{ value: number }>('singleton');
    let factoryCalls = 0;

    container.instance(instanceToken, { value: 1 });
    container.singleton(singletonToken, () => {
      factoryCalls += 1;
      return { value: 2 };
    });

    expect(container.resolve(instanceToken)).toEqual({ value: 1 });
    expect(container.resolve(singletonToken)).toEqual({ value: 2 });
    expect(container.resolve(singletonToken)).toEqual({ value: 2 });
    expect(factoryCalls).toBe(1);
    expect(container.resolveIfCreated(singletonToken)).toEqual({ value: 2 });
  });

  it('reports missing, duplicate, and circular services', () => {
    const container = new ServiceContainer();
    const firstToken = createServiceToken('first');
    const secondToken = createServiceToken('second');
    const circularFirstToken = createServiceToken('circular-first');
    const circularSecondToken = createServiceToken('circular-second');

    expect(() => container.resolve(firstToken)).toThrow(
      'Service "first" is not registered.',
    );

    container.instance(firstToken, 1);
    expect(() => container.instance(firstToken, 2)).toThrow(
      'Service "first" is already registered.',
    );

    container.singleton(secondToken, () => 2);
    expect(container.has(secondToken)).toBe(true);

    container.singleton(circularFirstToken, (resolver) =>
      resolver.resolve(circularSecondToken),
    );
    container.singleton(circularSecondToken, (resolver) =>
      resolver.resolve(circularFirstToken),
    );
    expect(() => container.resolve(circularFirstToken)).toThrow(
      'Circular service dependency detected: circular-first -> circular-second -> circular-first.',
    );
  });

  it('keeps a failed singleton factory in the failed state', () => {
    const container = new ServiceContainer();
    const token = createServiceToken('failed-singleton');
    const error = new Error('factory failed');
    let factoryCalls = 0;
    container.singleton(token, () => {
      factoryCalls += 1;
      throw error;
    });

    expect(() => container.resolve(token)).toThrow(error);
    expect(() => container.resolve(token)).toThrow(error);
    expect(factoryCalls).toBe(1);
  });
});

describe('service provider registry', () => {
  it('runs every provider by lifecycle phase', async () => {
    const calls: string[] = [];
    const first = new TestProvider('first', calls);
    const second = new TestProvider('second', calls);
    const registry = new ServiceProviderRegistry();

    registry.add(first);
    registry.add(second);
    registry.registerAll();
    await registry.bootAll();
    await registry.startAll();
    await registry.readyAll();
    await registry.shutdown();

    expect(calls).toEqual([
      'first:register',
      'second:register',
      'first:boot',
      'second:boot',
      'first:start',
      'second:start',
      'first:ready',
      'second:ready',
      'second:shutdown',
      'first:shutdown',
    ]);
  });

  it('shuts down initialized providers when startup fails', async () => {
    const calls: string[] = [];
    const first = new TestProvider('first', calls);
    const second = new TestProvider('second', calls, 'start');
    const registry = new ServiceProviderRegistry();

    registry.add(first);
    registry.add(second);
    registry.registerAll();
    await registry.bootAll();

    await expect(registry.startAll()).rejects.toThrow('second start failed');
    expect(calls).toEqual([
      'first:register',
      'second:register',
      'first:boot',
      'second:boot',
      'first:start',
      'second:start',
      'second:shutdown',
      'first:shutdown',
    ]);
  });

  it('makes shutdown idempotent and aggregates shutdown errors', async () => {
    const calls: string[] = [];
    const first = new TestProvider('first', calls, 'shutdown');
    const second = new TestProvider('second', calls, 'shutdown');
    const registry = new ServiceProviderRegistry();

    registry.add(first);
    registry.add(second);
    registry.registerAll();

    const shutdown = registry.shutdown();
    await expect(shutdown).rejects.toBeInstanceOf(AggregateError);
    await expect(registry.shutdown()).rejects.toBeInstanceOf(AggregateError);
    expect(calls).toEqual([
      'first:register',
      'second:register',
      'second:shutdown',
      'first:shutdown',
    ]);
  });

  it('preserves startup and shutdown errors when cleanup fails', async () => {
    const calls: string[] = [];
    const provider = new TestProvider('failing', calls, 'start-and-shutdown');
    const registry = new ServiceProviderRegistry();
    registry.add(provider);
    registry.registerAll();
    await registry.bootAll();

    const error = await registry.startAll().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'failing start failed' }),
      expect.objectContaining({ message: 'failing shutdown failed' }),
    ]);
  });
});

class TestProvider extends ServiceProvider {
  public readonly name: string;

  public constructor(
    name: string,
    private readonly calls: string[],
    private readonly failurePhase?: 'start' | 'shutdown' | 'start-and-shutdown',
  ) {
    super({ container: new ServiceContainer() });
    this.name = name;
  }

  public override register(): void {
    this.calls.push(`${this.name}:register`);
  }

  public override async boot(): Promise<void> {
    this.calls.push(`${this.name}:boot`);
  }

  public override async start(): Promise<void> {
    this.calls.push(`${this.name}:start`);
    if (
      this.failurePhase === 'start' ||
      this.failurePhase === 'start-and-shutdown'
    ) {
      throw new Error(`${this.name} start failed`);
    }
  }

  public override async ready(): Promise<void> {
    this.calls.push(`${this.name}:ready`);
  }

  public override async shutdown(): Promise<void> {
    this.calls.push(`${this.name}:shutdown`);
    if (
      this.failurePhase === 'shutdown' ||
      this.failurePhase === 'start-and-shutdown'
    ) {
      throw new Error(`${this.name} shutdown failed`);
    }
  }
}
