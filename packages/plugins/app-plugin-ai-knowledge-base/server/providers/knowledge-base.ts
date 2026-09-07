import {
  aiConfig,
  resolveAIKnowledgeBaseStorageDisks,
} from '@nocobase/app-plugin-ai-employee/server/config';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server/tokens';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { fileStorageFactoryToken, type AIManager } from '@nocobase/ai-employee';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { KnowledgeBaseFeatureImpl } from '../features/knowledge-base-feature.js';
import { LocalVectorStoreProvider } from '../extensions/vector-store/local-provider.js';
import {
  PG_VECTOR_PROVIDER_NAME,
  PGVectorProvider,
} from '../extensions/vector-database/pg-vector-provider.js';
import { ReadonlyVectorStoreProvider } from '../extensions/vector-store/readonly-store-provider.js';
import { VectorDatabaseProviderFeatureImpl } from '../features/vector-database-provider-feature.js';
import { VectorStoreProviderFeatureImpl } from '../features/vector-store-provider-feature.js';
import {
  managerFactoryToken,
  KnowledgeBaseManagerFactory,
} from '../factories/manager-factory.js';
import {
  repositoryFactoryToken,
  KnowledgeBaseRepositoryFactory,
} from '../factories/repository-factory.js';
import {
  serviceFactoryToken,
  KnowledgeBaseServiceFactory,
} from '../factories/service-factory.js';
import {
  bindKnowledgeBaseVectorizationExecutor,
  unbindKnowledgeBaseVectorizationExecutor,
} from '../jobs/knowledge-base-vectorization.js';
import { KnowledgeBaseManifestBootstrapper } from '../manifest-bootstrap.js';
import { knowledgeBaseManifestServiceToken } from '../manifest.js';
import { VectorDatabaseConfigSynchronizer } from '../vector-database-config.js';
import type { KnowledgeBaseVectorizationExecutor } from '../internal-types.js';

const AI_FEATURE_KEYS = [
  'vectorDatabaseProvider',
  'vectorStoreProvider',
  'knowledgeBase',
] as const;

export class KnowledgeBaseProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-ai-knowledge-base';
  private boundExecutor: KnowledgeBaseVectorizationExecutor | undefined;
  private featuresEnabled = false;
  private unsubscribeConfig: (() => void) | undefined;
  private vectorConfigSynchronizer:
    VectorDatabaseConfigSynchronizer | undefined;

  public override register(): void {
    const allowedStorageDisks = resolveAIKnowledgeBaseStorageDisks(
      this.app.config.get(aiConfig),
      this.app.config.get(driveConfig).default,
    );
    this.app.container.singleton(
      repositoryFactoryToken,
      () =>
        new KnowledgeBaseRepositoryFactory(
          this.app.container.resolve(databaseManagerToken).connection(),
        ),
    );
    this.app.container.singleton(managerFactoryToken, () => {
      const logger = this.app.container
        .resolve(loggingToken)
        .getLogger()
        .child({ module: 'ai-knowledge-base' });
      return new KnowledgeBaseManagerFactory(
        this.app.container.resolve(aiManagerToken),
        this.app.container.resolve(fileStorageFactoryToken),
        this.app.container.resolve(queueManagerToken),
        this.app.container.resolve(repositoryFactoryToken),
        allowedStorageDisks,
        {
          warn(message, details): void {
            logger.warn(details, message);
          },
        },
      );
    });
    this.app.container.singleton(
      serviceFactoryToken,
      () =>
        new KnowledgeBaseServiceFactory(
          this.app.container.resolve(aiManagerToken),
          this.app.container.resolve(managerFactoryToken),
          this.app.container.resolve(driveManagerToken),
          this.app.container.resolve(repositoryFactoryToken),
          allowedStorageDisks,
          {
            warn: (message, details): void => {
              this.app.container
                .resolve(loggingToken)
                .getLogger()
                .child({ module: 'ai-knowledge-base' })
                .warn(details, message);
            },
          },
        ),
    );
    this.app.container.singleton(
      knowledgeBaseManifestServiceToken,
      () => this.app.container.resolve(serviceFactoryToken).manifests,
    );
  }

  public override async boot(): Promise<void> {
    const ai = this.app.container.resolve(aiManagerToken);
    const repositories = this.app.container.resolve(repositoryFactoryToken);
    const managers = this.app.container.resolve(managerFactoryToken);
    const services = this.app.container.resolve(serviceFactoryToken);
    const executor = services.vectorization;
    bindKnowledgeBaseVectorizationExecutor(executor);
    this.boundExecutor = executor;

    const vectorDatabaseProvider = new VectorDatabaseProviderFeatureImpl();
    const vectorStoreProvider = new VectorStoreProviderFeatureImpl();
    ai.features.enableFeatures({
      vectorDatabaseProvider,
      vectorStoreProvider,
      knowledgeBase: new KnowledgeBaseFeatureImpl(
        ai,
        repositories.knowledgeBases,
        managers.segments,
      ),
    });
    ai.features.vectorDatabaseProvider.register({
      name: PG_VECTOR_PROVIDER_NAME,
      spec: 'PGVector',
      provider: new PGVectorProvider(),
    });
    this.registerBuiltInVectorStoreProviders(ai, managers);
    this.featuresEnabled = true;

    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger()
      .child({ module: 'ai-knowledge-base' });
    const warningLogger = {
      warn(message: string, details?: Record<string, unknown>): void {
        logger.warn(details, message);
      },
    };
    const synchronizer = new VectorDatabaseConfigSynchronizer(
      ai,
      repositories.vectorDatabases,
      repositories.knowledgeBases,
      warningLogger,
      () => managers.vectorStores.clear(),
    );
    this.vectorConfigSynchronizer = synchronizer;
    const config = this.app.config.get(aiConfig);
    try {
      await synchronizer.enqueue(config.aiKnowledgeBase?.vectorDatabases);

      this.unsubscribeConfig = this.app.config.subscribe(
        aiConfig,
        async ({ current }): Promise<void> => {
          await synchronizer.enqueue(current.aiKnowledgeBase?.vectorDatabases);
        },
      );

      const bootstrapper = new KnowledgeBaseManifestBootstrapper(
        this.app.container.resolve(driveManagerToken),
        repositories,
        services.manifests,
        warningLogger,
      );
      await bootstrapper.apply(config.aiKnowledgeBase?.manifests);
    } catch (error) {
      this.unsubscribeConfig?.();
      this.unsubscribeConfig = undefined;
      await synchronizer.close();
      this.vectorConfigSynchronizer = undefined;
      throw error;
    }
  }

  public override async shutdown(): Promise<void> {
    this.unsubscribeConfig?.();
    this.unsubscribeConfig = undefined;
    await this.vectorConfigSynchronizer?.close();
    this.vectorConfigSynchronizer = undefined;
    if (this.featuresEnabled) {
      const features = this.app.container.resolve(aiManagerToken).features;
      const vectorDatabaseProviders =
        features.vectorDatabaseProvider.listProviders();
      await Promise.all(
        vectorDatabaseProviders.map(({ provider }) => provider.dispose()),
      );
      features.disableFeatures([...AI_FEATURE_KEYS]);
      this.featuresEnabled = false;
    }
    if (this.boundExecutor) {
      unbindKnowledgeBaseVectorizationExecutor(this.boundExecutor);
      this.boundExecutor = undefined;
    }
    this.app.container.resolveIfCreated(serviceFactoryToken)?.dispose();
    this.app.container.resolveIfCreated(managerFactoryToken)?.dispose();
    this.app.container.resolveIfCreated(repositoryFactoryToken)?.dispose();
  }

  private registerBuiltInVectorStoreProviders(
    ai: AIManager,
    managers: KnowledgeBaseManagerFactory,
  ): void {
    const local = new LocalVectorStoreProvider(managers.vectorStores);
    const readonly = new ReadonlyVectorStoreProvider(managers.vectorStores);
    ai.features.vectorStoreProvider.register(local);
    ai.features.vectorStoreProvider.register(readonly);
  }
}
