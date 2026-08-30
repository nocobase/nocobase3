import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { DefaultSystemInfoService } from '../services/system-info.js';
import { systemInfoServiceToken } from '../tokens.js';

export interface SystemInfoProviderApplication {
  readonly container: ServiceContainer;
}

export class SystemInfoProvider extends ServiceProvider<SystemInfoProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-system-info';

  public override register(): void {
    this.app.container.singleton(
      systemInfoServiceToken,
      () => new DefaultSystemInfoService(),
    );
  }
}
