import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { TrustedAuditRuntime } from '../runtime.js';
import type { AuditService } from '../contracts.js';
import type { AuditHttpCollector } from '../http.js';

/** Load neutral public bridges only for definitions actually registered in this App. */
export async function bindOfficialProducers(
  app: AppPluginApplication,
  runtime: TrustedAuditRuntime,
  service: AuditService,
  collector: AuditHttpCollector,
  required: boolean,
): Promise<void> {
  const has = (name: string): boolean =>
    app.hasPlugin?.('@nocobase/app-plugin-' + name) ?? false;
  if (has('workflow')) {
    const { workflowAuditToken } =
      await import('@nocobase/app-plugin-workflow/server/audit');
    app.container.instance(workflowAuditToken, { runtime, service, collector });
  }
  if (has('ai-employee')) {
    const { aiEmployeeAuditToken } =
      await import('@nocobase/app-plugin-ai-employee/server/audit');
    app.container.instance(aiEmployeeAuditToken, {
      runtime,
      service,
      collector,
    });
  }
  if (has('install')) {
    const { installAuditToken } =
      await import('@nocobase/app-plugin-install/server/audit');
    app.container.instance(installAuditToken, {
      http: (declaration) => service.http(declaration),
      record: (event) => runtime.recorder.record(event),
      required,
    });
  }
  if (has('i18n')) {
    const { i18nAuditToken } =
      await import('@nocobase/app-plugin-i18n/server/audit');
    app.container.instance(i18nAuditToken, {
      http: (declaration) => service.http(declaration),
    });
  }
  if (has('notification')) {
    const { notificationAuditToken } =
      await import('@nocobase/app-plugin-notification/server/audit');
    app.container.instance(notificationAuditToken, {
      http: (declaration) => service.http(declaration),
    });
  }
  if (has('notification-in-app')) {
    const { inAppNotificationAuditToken } =
      await import('@nocobase/app-plugin-notification-in-app/server/audit');
    app.container.instance(inAppNotificationAuditToken, {
      http: (declaration) => service.http(declaration),
      withIdentity: async (context, verifiedUserId, next) => {
        const proceed = async (): Promise<void> => {
          collector.captureScope(context);
          await next();
        };
        if (verifiedUserId)
          await runtime.runAuthenticated(
            { actor: { type: 'user', id: verifiedUserId } },
            proceed,
          );
        else await runtime.runAnonymous(proceed);
      },
    });
  }
}
