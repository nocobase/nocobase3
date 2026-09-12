export interface ServiceProviderLifecycle {
  readonly name: string;
  register(): void;
  boot(): Promise<void>;
  start(): Promise<void>;
  ready(): Promise<void>;
  shutdown(): Promise<void>;
}

export abstract class ServiceProvider<
  TApplication = unknown,
> implements ServiceProviderLifecycle {
  public abstract readonly name: string;

  public constructor(protected readonly app: TApplication) {}

  public register(): void {}

  public async boot(): Promise<void> {}

  public async start(): Promise<void> {}

  public async ready(): Promise<void> {}

  public async shutdown(): Promise<void> {}
}

export type ServiceProviderConstructor<
  TApplication = unknown,
  TArguments extends readonly unknown[] = [],
> = new (
  app: TApplication,
  ...args: TArguments
) => ServiceProvider<TApplication>;
