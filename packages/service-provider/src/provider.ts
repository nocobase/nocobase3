import type { ServiceProviderContext } from './context.js';

export abstract class ServiceProvider<TRuntime = unknown> {
  public abstract readonly name: string;

  public constructor(
    protected readonly context: ServiceProviderContext<TRuntime>,
  ) {}

  public register(): void {}

  public async boot(): Promise<void> {}

  public async start(): Promise<void> {}

  public async ready(): Promise<void> {}

  public async shutdown(): Promise<void> {}
}

export type ServiceProviderConstructor<
  TRuntime = unknown,
  TArguments extends readonly unknown[] = [],
> = new (
  context: ServiceProviderContext<TRuntime>,
  ...args: TArguments
) => ServiceProvider<TRuntime>;
