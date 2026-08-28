import type { ServiceContainer } from './container.js';

export interface ServiceProviderContext<TRuntime = unknown> {
  readonly runtime: TRuntime;
  readonly serviceContainer: ServiceContainer;
}
