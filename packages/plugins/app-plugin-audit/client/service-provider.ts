import {
  appApiClientToken,
  type ClientApplication,
} from '@nocobase/app-client';
import { clientAccessResolversToken } from '@nocobase/app-plugin-authorization/client';
import { ServiceProvider } from '@nocobase/service-provider';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';

class AuditClientProvider extends ServiceProvider<ClientApplication> {
  readonly name: string = '@nocobase/app-plugin-audit/client';
  private readonly disposers: (() => void)[] = [];
  override async boot(): Promise<void> {
    if (!this.app.container.has(clientAccessResolversToken)) return;
    const registry = this.app.container.resolve(clientAccessResolversToken);
    const client = this.app.container.resolve(appApiClientToken);
    for (const [resource, key] of [
      ['audit.events', 'events'],
      ['audit.settings', 'settings'],
    ] as const) {
      this.disposers.push(
        registry.register(resource, async (action) => {
          if (action !== 'read') return { can: false };
          const response = await client.request<{
            data: { events: boolean; settings: boolean };
          }>('audit/capabilities');
          return { can: response.data[key] === true };
        }),
      );
    }
  }
  override async shutdown(): Promise<void> {
    for (const dispose of this.disposers.splice(0)) dispose();
  }
}
const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  AuditClientProvider,
];
export default serviceProviders;
