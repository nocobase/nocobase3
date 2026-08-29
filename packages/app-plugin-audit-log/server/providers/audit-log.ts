import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { DefaultAuditLogService } from '../services/audit-log.js';
import { auditLogServiceToken } from '../tokens.js';

export interface AuditLogProviderApplication {
  readonly container: ServiceContainer;
}

export class AuditLogProvider extends ServiceProvider<AuditLogProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-audit-log';

  public override register(): void {
    this.app.container.singleton(
      auditLogServiceToken,
      () => new DefaultAuditLogService(),
    );
  }
}
