import { appApiClientToken, ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';

import { configureWorkflowClient } from './workflow-management/runtime.js';

export class WorkflowServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-workflow/client';

  public override boot(): Promise<void> {
    configureWorkflowClient(this.app.container.resolve(appApiClientToken));
    return Promise.resolve();
  }
}
