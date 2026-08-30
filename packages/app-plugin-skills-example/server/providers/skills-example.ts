import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { DefaultAppNoticeService } from '../services/skills-example.js';
import { appNoticeServiceToken } from '../tokens.js';

export interface SkillsExampleProviderApplication {
  readonly container: ServiceContainer;
}

export class SkillsExampleProvider extends ServiceProvider<SkillsExampleProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-skills-example';

  public override register(): void {
    this.app.container.singleton(
      appNoticeServiceToken,
      () => new DefaultAppNoticeService(),
    );
  }
}
