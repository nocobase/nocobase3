import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerOrganizationAuthorization } from '../authorization.js';
import { createOrganizationService } from '../services/organization.js';
import { organizationServiceToken } from '../tokens.js';

export class OrganizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string =
    '@nocobase/app-plugin-departments-example/organization';

  private release: (() => void) | undefined;

  public override register(): void {
    this.app.container.singleton(organizationServiceToken, (container) => {
      const ids = container.resolve(idGeneratorToken);
      return createOrganizationService({
        database: container.resolve(databaseManagerToken),
        users: container.resolve(userAdministrationServiceToken),
        generateId: () => ids.generateString(),
      });
    });
  }

  public override async boot(): Promise<void> {
    this.release = registerOrganizationAuthorization(
      this.app.container.resolve(authorizationToken),
      this.app.container.resolve(organizationServiceToken),
    );
  }

  public override async shutdown(): Promise<void> {
    this.release?.();
    this.release = undefined;
  }
}
