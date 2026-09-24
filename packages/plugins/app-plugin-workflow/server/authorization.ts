import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

export class WorkflowAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-workflow/authorization';

  public override async boot(): Promise<void> {
    const authz = this.app.container.resolve(authorizationToken);
    // Workflow and scheduler both add it; an identical re-add is a no-op.
    authz.sections.add({
      name: 'automation',
      title: {
        key: 'sections.automation',
        ns: '@nocobase/app-plugin-authorization',
      },
      parent: 'administration',
    });
    authz.settings.add({
      id: 'workflow',
      title: {
        key: 'authorization.title',
        ns: '@nocobase/app-plugin-workflow',
      },
      section: 'automation',
      actions: [
        {
          name: 'manage',
          title: {
            key: 'authorization.manage',
            ns: '@nocobase/app-plugin-workflow',
          },
        },
      ],
    });
  }
}
