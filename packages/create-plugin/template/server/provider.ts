import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { Default__NOCOBASE_SYMBOL_NAME__Service } from './service.js';
import { __NOCOBASE_MODULE_NAME__ServiceToken } from './token.js';

export interface __NOCOBASE_SYMBOL_NAME__ProviderApplication {
  readonly container: ServiceContainer;
}

export default class __NOCOBASE_SYMBOL_NAME__Provider extends ServiceProvider<__NOCOBASE_SYMBOL_NAME__ProviderApplication> {
  public readonly name: string = __NOCOBASE_PACKAGE_NAME_LITERAL__;

  public override register(): void {
    this.app.container.singleton(
      __NOCOBASE_MODULE_NAME__ServiceToken,
      () => new Default__NOCOBASE_SYMBOL_NAME__Service(),
    );
  }
}
