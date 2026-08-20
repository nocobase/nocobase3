import type { AppDisposer, AppLifecycle } from '../app-options.js';

export interface AppDisposerRegistry extends AppLifecycle {
  disposeAll(): Promise<void>;
}

interface RegisteredAppDisposer {
  name: string;
  dispose: () => Promise<void>;
}

export function createAppDisposerRegistry(): AppDisposerRegistry {
  const disposers: RegisteredAppDisposer[] = [];
  const disposeAll = onceAsync(async () => {
    const errors: unknown[] = [];

    for (const disposer of [...disposers].reverse()) {
      try {
        await disposer.dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    disposers.length = 0;

    if (errors.length === 1) {
      throw errors[0];
    }

    if (errors.length > 1) {
      throw new AggregateError(errors, 'Failed to dispose app resources');
    }
  });

  return {
    registerDisposer(name, dispose) {
      disposers.push({
        name,
        dispose: onceAsync(dispose),
      });
    },
    disposeAll,
  };
}

export function onceAsync(dispose: AppDisposer): () => Promise<void> {
  let promise: Promise<void> | undefined;

  return () => {
    promise ??= Promise.resolve().then(dispose);
    return promise;
  };
}
