import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { registerOrganizationAuthorization } from '../authorization.js';
import { provisionDemoAccounts } from '../demo.js';
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

  public override async start(): Promise<void> {
    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('departments-example');
    try {
      await provisionDemoAccounts({
        users: this.app.container.resolve(userAdministrationServiceToken),
        organization: this.app.container.resolve(organizationServiceToken),
      });
    } catch (error) {
      // Demonstration data never blocks startup.
      logger.warn({ err: error }, 'Could not create the demo accounts');
    }
  }

  public override async shutdown(): Promise<void> {
    this.release?.();
    this.release = undefined;
  }
}
