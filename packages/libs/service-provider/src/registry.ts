import type { ServiceProviderLifecycle } from './provider.js';

type ProviderState =
  | 'new'
  | 'registering'
  | 'registered'
  | 'booting'
  | 'booted'
  | 'starting'
  | 'started'
  | 'readying'
  | 'ready'
  | 'failed'
  | 'shutting-down'
  | 'shutdown';

interface RegisteredProvider {
  provider: ServiceProviderLifecycle;
  state: ProviderState;
}

export class ServiceProviderRegistry {
  private readonly providers: RegisteredProvider[] = [];
  private phase: ProviderState = 'new';
  private shutdownPromise: Promise<void> | undefined;

  public add(provider: ServiceProviderLifecycle): void {
    if (this.phase !== 'new') {
      throw new Error('Providers can only be added before registration.');
    }

    if (
      this.providers.some(({ provider: item }) => item.name === provider.name)
    ) {
      throw new Error(
        `Service provider "${provider.name}" is already registered.`,
      );
    }

    this.providers.push({ provider, state: 'new' });
  }

  public registerAll(): void {
    this.assertPhase('new');

    for (const entry of this.providers) {
      entry.state = 'registering';
      try {
        entry.provider.register();
        entry.state = 'registered';
      } catch (error) {
        entry.state = 'failed';
        this.phase = 'failed';
        throw error;
      }
    }

    this.phase = 'registered';
  }

  public async bootAll(): Promise<void> {
    this.assertPhase('registered');
    await this.runPhase('booting', 'booted', (provider) => provider.boot());
    this.phase = 'booted';
  }

  public async startAll(): Promise<void> {
    this.assertPhase('booted');
    await this.runPhase('starting', 'started', (provider) => provider.start());
    this.phase = 'started';
  }

  public async readyAll(): Promise<void> {
    this.assertPhase('started');
    await this.runPhase('readying', 'ready', (provider) => provider.ready());
    this.phase = 'ready';
  }

  public shutdown(): Promise<void> {
    this.shutdownPromise ??= this.shutdownAll();
    return this.shutdownPromise;
  }

  private async runPhase(
    runningState: ProviderState,
    completedState: ProviderState,
    run: (provider: ServiceProviderLifecycle) => Promise<void>,
  ): Promise<void> {
    for (const entry of this.providers) {
      if (entry.state === 'shutdown') {
        continue;
      }

      entry.state = runningState;
      try {
        await run(entry.provider);
        entry.state = completedState;
      } catch (error) {
        entry.state = 'failed';
        this.phase = 'failed';
        await this.shutdownAfterFailure(error);
        throw error;
      }
    }
  }

  private async shutdownAfterFailure(startupError: unknown): Promise<void> {
    try {
      await this.shutdown();
    } catch (shutdownError) {
      throw new AggregateError(
        [startupError, shutdownError],
        'Provider startup and shutdown both failed.',
        { cause: shutdownError },
      );
    }
  }

  private async shutdownAll(): Promise<void> {
    const errors: unknown[] = [];
    this.phase = 'shutting-down';

    for (const entry of [...this.providers].reverse()) {
      if (entry.state === 'new' || entry.state === 'shutdown') {
        continue;
      }

      entry.state = 'shutting-down';
      try {
        await entry.provider.shutdown();
        entry.state = 'shutdown';
      } catch (error) {
        entry.state = 'failed';
        errors.push(error);
      }
    }

    this.phase = 'shutdown';
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        'Failed to shut down service providers.',
      );
    }
  }

  private assertPhase(expected: ProviderState): void {
    if (this.phase !== expected) {
      throw new Error(
        `Cannot run provider phase from state "${this.phase}"; expected "${expected}".`,
      );
    }
  }
}
