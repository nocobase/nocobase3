import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

export class WorkflowAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-workflow/authorization';

  public override async boot(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);
    const title = {
      key: 'authorization.title',
      ns: '@nocobase/app-plugin-workflow',
    };
    if (!authz.resourceGroups.has('automation')) {
      authz.resourceGroups.add({
        name: 'automation',
        title: { key: 'nav.automation', ns: '@nocobase/app-plugin-workflow' },
        category: 'administration',
      });
    }
    authz.resources.add({
      name: 'workflow',
      title,
      group: 'automation',
      actions: [
        {
          name: 'read',
          title: {
            key: 'authorization.read',
            ns: '@nocobase/app-plugin-workflow',
          },
          grants: [authz.settings.grant('workflow', ['read'])],
        },
      ],
    });
  }
}
