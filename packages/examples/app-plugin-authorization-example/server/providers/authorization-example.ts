import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { COLLECTION } from '../collection.js';

/**
 * Puts this example's Collection into the permission model. Registration is
 * explicit so the Collection carries the title the permission UI shows.
 */
export class AuthorizationExampleProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name = '@nocobase/app-plugin-authorization-example';

  public override boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();
    this.app.container
      .resolve(authorizationToken)
      .getResource('database.collection')
      .items.add({
        name: COLLECTION,
        title: 'Authorization example: tasks',
        description: 'Tasks each signed-in user owns.',
      });
    return Promise.resolve();
  }
}
