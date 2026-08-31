import { ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-template-default/client';

  public override boot(): Promise<void> {
    this.app.refine.setOptions({ title: { text: 'NocoBase' } });
    return Promise.resolve();
  }
}
