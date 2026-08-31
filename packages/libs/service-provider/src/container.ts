import type { ServiceToken } from './token.js';

export interface ServiceResolver {
  has<T>(token: ServiceToken<T>): boolean;
  resolve<T>(token: ServiceToken<T>): T;
  resolveIfCreated<T>(token: ServiceToken<T>): T | undefined;
}

export type ServiceFactory<T> = (resolver: ServiceResolver) => T;

interface ServiceBinding {
  factory: ServiceFactory<unknown>;
  instance: unknown;
  state: 'pending' | 'creating' | 'created' | 'failed';
  error?: unknown;
}

export class ServiceContainer implements ServiceResolver {
  private readonly bindings = new Map<ServiceToken<unknown>, ServiceBinding>();
  private readonly resolving: ServiceToken<unknown>[] = [];

  public instance<T>(token: ServiceToken<T>, value: T): void {
    this.assertAvailable(token);
    this.bindings.set(token, {
      factory: () => value,
      instance: value,
      state: 'created',
    });
  }

  public singleton<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
  ): void {
    this.assertAvailable(token);
    this.bindings.set(token, {
      factory,
      instance: undefined,
      state: 'pending',
    });
  }

  public has<T>(token: ServiceToken<T>): boolean {
    return this.bindings.has(token);
  }

  public resolve<T>(token: ServiceToken<T>): T {
    const binding = this.bindings.get(token);
    if (!binding) {
      throw new Error(`Service "${token.name}" is not registered.`);
    }

    if (binding.state === 'created') {
      return binding.instance as T;
    }

    if (binding.state === 'failed') {
      throw binding.error;
    }

    if (binding.state === 'creating') {
      const cycle = [...this.resolving, token]
        .map((item) => item.name)
        .join(' -> ');
      throw new Error(`Circular service dependency detected: ${cycle}.`);
    }

    binding.state = 'creating';
    this.resolving.push(token);
    try {
      const value = binding.factory(this);
      binding.instance = value;
      binding.state = 'created';
      return value as T;
    } catch (error) {
      binding.error = error;
      binding.state = 'failed';
      throw error;
    } finally {
      this.resolving.pop();
    }
  }

  public resolveIfCreated<T>(token: ServiceToken<T>): T | undefined {
    const binding = this.bindings.get(token);
    if (!binding || binding.state !== 'created') {
      return undefined;
    }

    return binding.instance as T;
  }

  private assertAvailable<T>(token: ServiceToken<T>): void {
    if (this.bindings.has(token)) {
      throw new Error(`Service "${token.name}" is already registered.`);
    }
  }
}
