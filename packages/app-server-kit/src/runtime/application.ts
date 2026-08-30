import type { Application } from '../application/index.js';
import { onceAsync } from './lifecycle.js';
import type { AppLifecycle } from './types.js';

/** Starts an application and binds its shutdown to the host-owned scope. */
export async function startApplicationInScope(
  scope: AppLifecycle,
  app: Application,
): Promise<Application> {
  scope.registerDisposer(
    'application',
    onceAsync(() => app.shutdown()),
  );
  await app.start();
  return app;
}
