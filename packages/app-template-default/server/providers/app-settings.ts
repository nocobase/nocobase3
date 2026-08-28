import {
  createServiceToken,
  ServiceProvider,
  type ServiceContainer,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
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

export interface AppSettingsProviderApplication {
  readonly config: AppConfig;
  readonly container: ServiceContainer;
}

export class AppSettingsProvider<
  TApplication extends AppSettingsProviderApplication =
    AppSettingsProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = 'app-settings';

  public override register(): void {
    this.app.container.singleton(appSettingsRepositoryToken, (container) =>
      this.createAppSettings(container),
    );
  }

  private createAppSettings(container: ServiceResolver): AppSettingsRepository {
    if (!container.has(databaseManagerToken)) {
      return new UnavailableAppSettingsRepository();
    }

    return new DatabaseAppSettingsRepository(
      container.resolve(databaseManagerToken),
    );
  }
}
