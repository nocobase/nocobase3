import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { createDriveManager } from './flydrive.js';
import { prepareDriveStorage } from './prepare.js';
import type { AppDriveConfig, NocoBaseDriveManager } from './types.js';

export const driveManagerToken: ServiceToken<NocoBaseDriveManager> =
  createServiceToken<NocoBaseDriveManager>('@nocobase/drive/manager');

export interface DriveProviderRuntimeConfig {
  readonly drive?: AppDriveConfig;
}

export interface DriveProviderRuntime<
  TConfig extends DriveProviderRuntimeConfig = DriveProviderRuntimeConfig,
> {
  readonly config: TConfig;
}

export class DriveProvider<
  TRuntime extends DriveProviderRuntime = DriveProviderRuntime,
> extends ServiceProvider<TRuntime> {
  public readonly name: string = '@nocobase/drive';

  public override register(): void {
    const drive = this.context.runtime.config.drive;
    if (!drive) {
      return;
    }

    this.context.serviceContainer.singleton(driveManagerToken, () =>
      createDriveManager(drive),
    );
  }

  public override async boot(): Promise<void> {
    const drive = this.context.runtime.config.drive;
    if (drive) {
      await prepareDriveStorage(drive);
    }
  }
}
