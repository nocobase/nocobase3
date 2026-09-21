import { ServiceProvider } from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { UserService } from './service.js';
import {
  UserLifecycleRegistry,
  type UsersDeletionConfig,
} from './lifecycle.js';
import { userServiceToken, userLifecycleToken } from './tokens.js';

export class UsersProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-users';

  public override register(): void {
    this.app.container.singleton(
      userLifecycleToken,
      () =>
        new UserLifecycleRegistry(
          this.app.config.get<UsersDeletionConfig>('users')?.deletion ?? {
            enabled: false,
          },
        ),
    );
    this.app.container.singleton(
      userServiceToken,
      (container) =>
        new UserService(
          container.resolve(databaseManagerToken).connection(),
          { lifecycle: container.resolve(userLifecycleToken) },
          () => container.resolve(idGeneratorToken).generateString(),
        ),
    );
  }

  /**
   * Participants register during their own boot, so the check waits for the
   * ready phase: an application that enables deletion but lacks a required
   * handler fails to start instead of failing its first deletion.
   */
  public override ready(): Promise<void> {
    const lifecycle = this.app.container.resolve(userLifecycleToken);
    if (lifecycle.deletionPolicy.enabled) lifecycle.assertDeletionReady();
    return Promise.resolve();
  }
}
