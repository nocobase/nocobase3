import {
  createServiceToken,
  ServiceProvider,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { databaseManagerToken } from '@nocobase/app-database';

import type { AppConfig } from '../config/index.js';
import {
  DatabaseAppSettingsRepository,
  UnavailableAppSettingsRepository,
  type AppSettingsRepository,
} from '../repositories/app-settings.js';

export const appSettingsRepositoryToken: ServiceToken<AppSettingsRepository> =
  createServiceToken<AppSettingsRepository>(
    '@nocobase/app-template-default/app-settings-repository',
  );

export class AppSettingsProvider extends ServiceProvider<
  AppRuntime<AppConfig>
> {
  public readonly name: string = 'app-settings';

  public override register(): void {
    this.context.serviceContainer.singleton(
      appSettingsRepositoryToken,
      (services) => this.createAppSettings(services),
    );
  }

  private createAppSettings(services: ServiceResolver): AppSettingsRepository {
    if (!services.has(databaseManagerToken)) {
      return new UnavailableAppSettingsRepository();
    }

    return new DatabaseAppSettingsRepository(
      services.resolve(databaseManagerToken),
    );
  }
}
