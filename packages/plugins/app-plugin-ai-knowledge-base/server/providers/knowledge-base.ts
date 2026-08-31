import { databaseManagerToken } from '@nocobase/app-database';
import { driveManagerToken } from '@nocobase/app-server-kit/drive';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { queueManagerToken } from '@nocobase/app-server-kit/queue';
import { ServiceProvider } from '@nocobase/service-provider';

import bootstrap from '../bootstrap.js';
import type { KnowledgeBasePluginDeps } from '../types.js';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server/tokens';

export class KnowledgeBaseProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-ai-knowledge-base';

  public override boot(): Promise<void> {
    bootstrap({
      config: this.app.config,
      deps: {
        ai: this.app.container.resolve(aiManagerToken),
        database: this.app.container.resolve(databaseManagerToken),
        queueManager: this.app.container.resolve(queueManagerToken),
        driveManager: this.app.container.has(driveManagerToken)
          ? this.app.container.resolve(driveManagerToken)
          : undefined,
      } satisfies KnowledgeBasePluginDeps & { driveManager?: unknown },
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
