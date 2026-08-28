import { Hono } from 'hono';

import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * The HTTP router owned by an application.
 *
 * The router is deliberately exposed as a service rather than being treated
 * as the application itself. This keeps the application lifecycle and
 * framework-specific HTTP implementation separate.
 */
export const routerToken: ServiceToken<Hono> = createServiceToken<Hono>(
  '@nocobase/app/router',
);

export class RouterProvider<
  TRuntime = unknown,
> extends ServiceProvider<TRuntime> {
  public readonly name: string = 'router';

  public override register(): void {
    this.context.serviceContainer.instance(routerToken, new Hono());
  }
}
