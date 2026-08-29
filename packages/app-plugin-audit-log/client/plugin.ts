import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface AuditLogClientOptions {
  /** Label used for the resource registered by the bootstrap entry. */
  readonly resourceLabel?: string;
}

const auditLog: AppClientPluginFactory<AuditLogClientOptions> =
  defineClientPlugin({
    packageName: '@nocobase/app-plugin-audit-log',
    bootstrap: () => import('./bootstrap.js'),
    routes: () => import('./routes.js'),
    providers: () => import('./providers.js'),
  });

export default auditLog;
