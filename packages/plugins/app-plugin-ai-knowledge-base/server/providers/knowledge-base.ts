import { databaseManagerToken } from '@nocobase/db';
import { driveConfig } from '@nocobase/app-server/drive';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { ServiceProvider } from '@nocobase/service-provider';

import bootstrap from '../bootstrap.js';
import type { KnowledgeBasePluginDeps } from '../types.js';
import {
  aiConfig,
  resolveAIKnowledgeBaseStorageDisks,
} from '@nocobase/app-plugin-ai-employee/server/config';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server/tokens';
import { fileStorageFactoryToken } from '@nocobase/ai-employee';

export class KnowledgeBaseProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-ai-knowledge-base';

  public override boot(): Promise<void> {
    bootstrap({
      config: this.app.config,
      deps: {
        ai: this.app.container.resolve(aiManagerToken),
        database: this.app.container.resolve(databaseManagerToken),
        queueManager: this.app.container.resolve(queueManagerToken),
        fileStorageFactory: this.app.container.resolve(fileStorageFactoryToken),
        allowedStorageDisks: resolveAIKnowledgeBaseStorageDisks(
          this.app.config.get(aiConfig),
          this.app.config.get(driveConfig).default,
        ),
      } satisfies KnowledgeBasePluginDeps,
      lifecycle: {
        registerDisposer: () => undefined,
      },
      paths: this.app.paths,
      services: {},
    });
    return Promise.resolve();
  }
}

export default [KnowledgeBaseProvider] as const;
