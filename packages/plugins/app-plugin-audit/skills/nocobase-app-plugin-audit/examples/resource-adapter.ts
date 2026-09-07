import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { databaseManagerToken } from '@nocobase/db';
import {
  auditResourceAdaptersToken,
  createAuditDatabaseResourceAdapter,
} from '@nocobase/app-plugin-audit/server';

// Register this provider after Audit in the App's server composition.
// The owner must migrate documents and register main.documents with authorization,
// including its identifier, owner attribute, and normal record-level grants.
export class DocumentAuditProvider extends ServiceProvider<AppPluginApplication> {
  readonly name: string = 'app/document-audit';
  private release?: () => void;

  override async boot(): Promise<void> {
    const connection = this.app.container
      .resolve(databaseManagerToken)
      .connection('main');
    this.release = this.app.container
      .resolve(auditResourceAdaptersToken)
      .register(
        createAuditDatabaseResourceAdapter({
          connection,
          resource: 'documents',
          table: 'documents',
          keyFields: ['id'],
          // Replace this example with the owner's trusted deployment boundary.
          boundaryFilter: { tenant: { $eq: 'example-tenant' } },
        }),
      );
  }

  override async shutdown(): Promise<void> {
    this.release?.();
  }
}
