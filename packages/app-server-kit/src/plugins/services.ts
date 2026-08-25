export interface AppPluginServiceToken<TService> {
  readonly id: symbol;
  readonly name: string;
  readonly serviceType?: (service: TService) => TService;
}

export function createAppPluginServiceToken<TService>(
  name: string,
): AppPluginServiceToken<TService> {
  return Object.freeze({ id: Symbol(name), name });
}

export class AppPluginServiceRegistry {
  private readonly services = new Map<symbol, unknown>();
  private readonly consumers = new Map<
    symbol,
    Array<(service: unknown) => void>
  >();

  provide<TService>(
    token: AppPluginServiceToken<TService>,
    service: TService,
  ): void {
    if (this.services.has(token.id)) {
      throw new Error(
        `App plugin service "${token.name}" is already provided.`,
      );
    }
    this.services.set(token.id, service);
    const consumers = this.consumers.get(token.id) ?? [];
    this.consumers.delete(token.id);
    for (const consume of consumers) consume(service);
  }

  get<TService>(token: AppPluginServiceToken<TService>): TService | undefined {
    return this.services.get(token.id) as TService | undefined;
  }

  require<TService>(token: AppPluginServiceToken<TService>): TService {
    const service = this.get(token);
    if (service === undefined) {
      throw new Error(`App plugin service "${token.name}" is not available.`);
    }
    return service;
  }

  onAvailable<TService>(
    token: AppPluginServiceToken<TService>,
    consume: (service: TService) => void,
  ): void {
    const service = this.get(token);
    if (service !== undefined) {
      consume(service);
      return;
    }
    const consumers = this.consumers.get(token.id) ?? [];
    consumers.push(consume as (service: unknown) => void);
    this.consumers.set(token.id, consumers);
  }
}

export function createAppPluginServiceRegistry(): AppPluginServiceRegistry {
  return new AppPluginServiceRegistry();
}
