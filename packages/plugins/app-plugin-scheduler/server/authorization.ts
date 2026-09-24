import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

export class SchedulerAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-scheduler/authorization';

  public override async boot(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);
    if (!authz.groups.has('automation'))
      authz.groups.add({
        name: 'automation',
        title: { key: 'nav.automation', ns: '@nocobase/app-plugin-scheduler' },
      });
    authz.settings.add({
      id: 'scheduler.schedules',
      title: {
        key: 'authorization.title',
        ns: '@nocobase/app-plugin-scheduler',
      },
      group: 'automation',
      actions: [
        {
          name: 'read',
          title: {
            key: 'authorization.read',
            ns: '@nocobase/app-plugin-scheduler',
          },
        },
      ],
    });
  }
}
