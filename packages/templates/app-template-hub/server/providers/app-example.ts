import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

export interface AppExampleService {
  getMessage(): string;
}

export const appExampleServiceToken: ServiceToken<AppExampleService> =
  createServiceToken<AppExampleService>(
    '@nocobase/app-template-hub/example-service',
  );

export default class AppExampleProvider extends ServiceProvider<Application> {
  public readonly name: string = '@nocobase/app-template-hub/example-provider';

  public override register(): void {
    this.app.container.instance(appExampleServiceToken, {
      getMessage(): string {
        return 'Hello from the application provider';
      },
    });
  }
}
