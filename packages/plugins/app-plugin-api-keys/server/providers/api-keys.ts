import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { apiDocsToken } from '@nocobase/app-server/router';
import { ServiceProvider } from '@nocobase/service-provider';

import { createApiKeyApiDocsAccess } from '../api-docs.js';

/** Lets a request carrying a valid API key read the application's API documentation. */
export class ApiKeysProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-api-keys';

  public override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(apiDocsToken) || !container.has(authenticationToken))
      return;
    container
      .resolve(apiDocsToken)
      .addAccess(
        createApiKeyApiDocsAccess(() => container.resolve(authenticationToken)),
      );
  }
}
