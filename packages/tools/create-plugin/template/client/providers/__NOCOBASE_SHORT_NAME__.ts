import type { ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';

export class __NOCOBASE_SYMBOL_NAME__ServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = __NOCOBASE_PACKAGE_NAME_LITERAL__;

  public override register(): void {
    // Register browser-side services owned by this plugin here.
  }
}
