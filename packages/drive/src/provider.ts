import {
  createServiceToken,
  ServiceProvider,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import { createDriveManager } from './flydrive.js';
import { prepareDriveStorage } from './prepare.js';
import type { AppDriveConfig, NocoBaseDriveManager } from './types.js';

export const driveManagerToken: ServiceToken<NocoBaseDriveManager> =
  createServiceToken<NocoBaseDriveManager>('@nocobase/drive/manager');

export interface DriveProviderApplicationConfig {
  readonly drive?: AppDriveConfig;
}

export interface DriveProviderApplication<
  TConfig extends DriveProviderApplicationConfig =
    DriveProviderApplicationConfig,
> {
  readonly config: TConfig;
  readonly container: ServiceContainer;
}

export class DriveProvider<
  TApplication extends DriveProviderApplication = DriveProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/drive';

  public override register(): void {
    const drive = this.app.config.drive;
    if (!drive) {
      return;
    }

    this.app.container.singleton(driveManagerToken, () =>
      createDriveManager(drive),
    );
  }

  public override async boot(): Promise<void> {
    const drive = this.app.config.drive;
    if (drive) {
      await prepareDriveStorage(drive);
    }
  }
}
