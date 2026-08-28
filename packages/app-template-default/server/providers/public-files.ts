import {
  createServiceToken,
  ServiceProvider,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { driveManagerToken } from '@nocobase/drive';

import type { AppConfig } from '../config/index.js';
import {
  DrivePublicFilesRepository,
  UnavailablePublicFilesRepository,
  type PublicFilesRepository,
} from '../repositories/public-files.js';

export const publicFilesRepositoryToken: ServiceToken<PublicFilesRepository> =
  createServiceToken<PublicFilesRepository>(
    '@nocobase/app-template-default/public-files-repository',
  );

export class PublicFilesProvider extends ServiceProvider<
  AppRuntime<AppConfig>
> {
  public readonly name: string = 'public-files';

  public override register(): void {
    this.context.serviceContainer.singleton(
      publicFilesRepositoryToken,
      (services) => this.createPublicFiles(services),
    );
  }

  private createPublicFiles(services: ServiceResolver): PublicFilesRepository {
    const drive = services.has(driveManagerToken)
      ? services.resolve(driveManagerToken)
      : undefined;
    const hasPublicDisk = Boolean(
      this.context.runtime.config.drive?.disks.public,
    );

    if (!drive || !hasPublicDisk) {
      return new UnavailablePublicFilesRepository(
        this.resolveUnavailableMessage(),
      );
    }

    return new DrivePublicFilesRepository(drive);
  }

  private resolveUnavailableMessage(): string {
    if (!this.context.runtime.config.drive) {
      return 'File drive is not configured.';
    }

    return 'Upload drive disk "public" is not configured.';
  }
}
