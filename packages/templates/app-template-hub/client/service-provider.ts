import { ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

export class DefaultClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-template-hub/client';

  public override boot(): Promise<void> {
    const configuredTitle = this.app.config.get<unknown>('app.title');
    const title =
      typeof configuredTitle === 'string' && configuredTitle.trim()
        ? configuredTitle.trim()
        : 'NocoBase';
    this.app.refine.setOptions({ title: { text: title } });
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  DefaultClientServiceProvider,
];

export default serviceProviders;
