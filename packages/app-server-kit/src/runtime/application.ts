import type { Application, ApplicationConfig } from '../application/index.js';
import { onceAsync } from './lifecycle.js';
import type { AppLifecycle } from './types.js';

/** Starts an application and binds its shutdown to the host-owned scope. */
export async function startApplicationInScope<
  TConfig extends ApplicationConfig,
>(
  scope: AppLifecycle,
  app: Application<TConfig>,
): Promise<Application<TConfig>> {
  scope.registerDisposer(
    'application',
    onceAsync(() => app.shutdown()),
  );
  await app.start();
  return app;
}
