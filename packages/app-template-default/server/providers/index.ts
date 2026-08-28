import type {
  Application,
  ApplicationServiceProviderConstructor,
} from '@nocobase/app-server-kit/application';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { AppConfig } from '../config/index.js';

export interface AppExampleService {
  getMessage(): string;
}

export const appExampleServiceToken: ServiceToken<AppExampleService> =
  createServiceToken<AppExampleService>(
    '@nocobase/app-template-default/example-service',
  );

class AppExampleProvider extends ServiceProvider<Application<AppConfig>> {
  public readonly name: string =
    '@nocobase/app-template-default/example-provider';

  public override register(): void {
    this.app.container.instance(appExampleServiceToken, {
      getMessage(): string {
        return 'Hello from the application provider';
      },
    });
  }
}

const providers: readonly ApplicationServiceProviderConstructor<AppConfig>[] = [
  AppExampleProvider,
];

export default providers;
