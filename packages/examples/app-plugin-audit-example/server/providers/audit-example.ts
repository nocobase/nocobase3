import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { loggingToken } from '@nocobase/app-server/logging';
import {
  queueJobFactoryRegistryToken,
  queueManagerToken,
} from '@nocobase/app-server/queue';
import { databaseManagerToken } from '@nocobase/db';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { auditServiceToken } from '@nocobase/app-plugin-audit/server';
import { CustomerService } from '../services/audit-example.js';
import { customerServiceToken } from '../tokens.js';
import {
  registerCustomerAuthorization,
  initializeCustomerPermissions,
} from '../authorization.js';
import CustomerMaintenanceJob from '../jobs/audit-example.js';

export class AuditExampleProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-audit-example';
  private registeredJob: boolean = false;
  public override register(): void {
    this.app.container.singleton(
      customerServiceToken,
      (services) =>
        new CustomerService(
          services.resolve(databaseManagerToken),
          (diagnostic) =>
            services
              .resolve(loggingToken)
              .getLogger('audit')
              .error({ ...diagnostic }, 'Customer audit output failed.'),
          this.app.appName,
        ),
    );
  }
  public override async boot(): Promise<void> {
    const services = this.app.container;
    const authorization = services.resolve(authorizationToken);
    await initializeCustomerPermissions(
      authorization,
      services.resolve(databaseManagerToken),
    );
    registerCustomerAuthorization(
      authorization,
      services.resolve(databaseManagerToken),
    );
    services.resolve(queueJobFactoryRegistryToken).register(
      CustomerMaintenanceJob.options.name!,
      () =>
        new CustomerMaintenanceJob({
          customers: services.resolve(customerServiceToken),
          audit: services.resolve(auditServiceToken),
          authorization,
        }),
    );
    this.registeredJob = true;
    services.resolve(queueManagerToken).registerJob(CustomerMaintenanceJob);
  }
  public override async shutdown(): Promise<void> {
    if (this.registeredJob)
      this.app.container
        .resolveIfCreated(queueJobFactoryRegistryToken)
        ?.unregister(CustomerMaintenanceJob.options.name!);
    this.registeredJob = false;
  }
}
