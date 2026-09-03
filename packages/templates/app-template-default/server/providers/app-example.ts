import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

// `create-app` rewrites this literal to the generated application's own package name. Keeping it alone on one short
// line means the rewrite cannot change how Prettier wraps the statements that use it: a shorter name would otherwise
// let a wrapped call collapse onto one line, leaving the generated project failing its own `pnpm format:check`.
const APP_PACKAGE_NAME = '@nocobase/app-template-default';

export interface AppExampleService {
  getMessage(): string;
}

export const appExampleServiceToken: ServiceToken<AppExampleService> =
  createServiceToken<AppExampleService>(`${APP_PACKAGE_NAME}/example-service`);

export default class AppExampleProvider extends ServiceProvider<Application> {
  public readonly name: string = `${APP_PACKAGE_NAME}/example-provider`;

  public override register(): void {
    this.app.container.instance(appExampleServiceToken, {
      getMessage(): string {
        return 'Hello from the application provider';
      },
    });
  }
}
