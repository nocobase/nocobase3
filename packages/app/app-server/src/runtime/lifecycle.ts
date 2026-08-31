import type { AppDisposer, AppLifecycle } from './types.js';

export interface AppDisposerRegistry extends AppLifecycle {
  disposeAll(): Promise<void>;
}

export interface AppScopeLifecycleOptions {
  readonly abortReason?: unknown;
}

interface RegisteredAppDisposer {
  readonly name: string;
  readonly dispose: () => Promise<void>;
}

/**
 * Owns cancellation and resource disposal for a host-provided application
 * scope. Concrete scopes add identity, paths, environment, and configuration.
 */
export class AppScopeLifecycle implements AppLifecycle {
  public readonly signal: AbortSignal;

  private readonly abortController: AbortController = new AbortController();
  private readonly beforeDestroyHandlers: AppDisposer[] = [];
  private readonly disposers: RegisteredAppDisposer[] = [];
  private readonly abortReason: unknown;
  private readonly destroyOnce: () => Promise<void>;
  private destroying = false;

  public constructor(options: AppScopeLifecycleOptions = {}) {
    this.signal = this.abortController.signal;
    this.abortReason =
      options.abortReason ?? new Error('application scope destroyed');
    this.destroyOnce = onceAsync(() => this.destroyResources());
  }

  public registerDisposer(name: string, dispose: AppDisposer): void {
    this.assertActive(`register disposer "${name}"`);
    this.disposers.push({ name, dispose: onceAsync(dispose) });
  }

  public onBeforeDestroy(handler: AppDisposer): () => void {
    this.assertActive('register a before-destroy handler');
    this.beforeDestroyHandlers.push(handler);

    return (): void => {
      const index = this.beforeDestroyHandlers.indexOf(handler);
      if (index >= 0) this.beforeDestroyHandlers.splice(index, 1);
    };
  }

  public destroy(): Promise<void> {
    this.destroying = true;
    return this.destroyOnce();
  }

  private assertActive(action: string): void {
    if (this.destroying) {
      throw new Error(`Cannot ${action} after application scope destruction.`);
    }
  }

  private async destroyResources(): Promise<void> {
    this.abortController.abort(this.abortReason);
    const errors: unknown[] = [];

    for (const handler of [...this.beforeDestroyHandlers]) {
      try {
        await handler();
      } catch (error) {
        errors.push(error);
      }
    }
    this.beforeDestroyHandlers.length = 0;

    await disposeRegisteredResources(this.disposers, errors);
    throwCollectedErrors(errors, 'Failed to destroy application scope.');
  }
}

export function createAppDisposerRegistry(): AppDisposerRegistry {
  const disposers: RegisteredAppDisposer[] = [];
  let disposing = false;
  const disposeAll = onceAsync(async () => {
    const errors: unknown[] = [];
    await disposeRegisteredResources(disposers, errors);
    throwCollectedErrors(errors, 'Failed to dispose application resources.');
  });

  return {
    registerDisposer(name, dispose): void {
      if (disposing) {
        throw new Error(
          `Cannot register disposer "${name}" after application resource disposal.`,
        );
      }
      disposers.push({ name, dispose: onceAsync(dispose) });
    },
    disposeAll(): Promise<void> {
      disposing = true;
      return disposeAll();
    },
  };
}

export function onceAsync(operation: AppDisposer): () => Promise<void> {
  let promise: Promise<void> | undefined;

  return (): Promise<void> => {
    promise ??= Promise.resolve().then(operation);
    return promise;
  };
}

async function disposeRegisteredResources(
  disposers: RegisteredAppDisposer[],
  errors: unknown[],
): Promise<void> {
  for (const entry of [...disposers].reverse()) {
    try {
      await entry.dispose();
    } catch (error) {
      errors.push(
        new Error(`Failed to dispose application resource "${entry.name}".`, {
          cause: error,
        }),
      );
    }
  }
  disposers.length = 0;
}

function throwCollectedErrors(errors: unknown[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}
