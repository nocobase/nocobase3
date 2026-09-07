import { ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';
import { Boxes } from 'lucide-react';

export class HubNavigationProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-hub/navigation';

  public override boot(): Promise<void> {
    this.app.refine.addResources([
      {
        name: 'hub',
        list: '/hub',
        meta: {
          icon: <Boxes />,
          label: 'navigation.applications',
          i18nNs: '@nocobase/app-plugin-hub',
        },
      },
    ]);
    return Promise.resolve();
  }
}
