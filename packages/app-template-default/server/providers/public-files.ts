import {
  createServiceToken,
  ServiceProvider,
  type ServiceContainer,
  type ServiceResolver,
  type ServiceToken,
} from '@nocobase/service-provider';
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

export interface PublicFilesProviderApplication {
  readonly config: AppConfig;
  readonly container: ServiceContainer;
}

export class PublicFilesProvider<
  TApplication extends PublicFilesProviderApplication =
    PublicFilesProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = 'public-files';

  public override register(): void {
    this.app.container.singleton(publicFilesRepositoryToken, (container) =>
      this.createPublicFiles(container),
    );
  }

  private createPublicFiles(container: ServiceResolver): PublicFilesRepository {
    const drive = container.has(driveManagerToken)
      ? container.resolve(driveManagerToken)
      : undefined;
    const hasPublicDisk = Boolean(this.app.config.drive?.disks.public);

    if (!drive || !hasPublicDisk) {
      return new UnavailablePublicFilesRepository(
        this.resolveUnavailableMessage(),
      );
    }

    return new DrivePublicFilesRepository(drive);
  }

  private resolveUnavailableMessage(): string {
    if (!this.app.config.drive) {
      return 'File drive is not configured.';
    }

    return 'Upload drive disk "public" is not configured.';
  }
}
