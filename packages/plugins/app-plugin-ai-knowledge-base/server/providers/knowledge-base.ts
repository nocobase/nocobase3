import {
  aiConfig,
  resolveAIKnowledgeBaseStorageDisks,
} from '@nocobase/app-plugin-ai-employee/server/config';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server/tokens';
import { driveConfig } from '@nocobase/app-server/drive';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { fileStorageFactoryToken, type AIManager } from '@nocobase/ai-employee';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { KnowledgeBaseFeatureImpl } from '../features/knowledge-base-feature.js';
import {
  LEGACY_LOCAL_VECTOR_STORE_PROVIDER_NAME,
  LocalVectorStoreProvider,
} from './vector-store/local-vector-store-provider.js';
import {
  PG_VECTOR_PROVIDER_NAME,
  PGVectorProvider,
} from './vector-database/pg-vector-provider.js';
import {
  LEGACY_READONLY_VECTOR_STORE_PROVIDER_NAME,
  ReadonlyVectorStoreProvider,
} from './vector-store/readonly-vector-store-provider.js';
import { VectorDatabaseFeatureImpl } from '../features/vector-database-feature.js';
import { VectorDatabaseProviderFeatureImpl } from '../features/vector-database-provider-feature.js';
import { VectorStoreProviderFeatureImpl } from '../features/vector-store-provider-feature.js';
import type { KnowledgeBaseManagerFactory } from '../factories/manager-factory.js';
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
import type { KnowledgeBaseVectorizationExecutor } from '../internal-types.js';

const AI_FEATURE_KEYS = [
  'vectorDatabase',
  'vectorDatabaseProvider',
  'vectorStoreProvider',
  'knowledgeBase',
] as const;

export class KnowledgeBaseProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-ai-knowledge-base';
  private boundExecutor: KnowledgeBaseVectorizationExecutor | undefined;
  private vectorProvider: PGVectorProvider | undefined;
  private featuresEnabled = false;

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
    this.app.container.singleton(serviceFactoryToken, () => {
      const ai = this.app.container.resolve(aiManagerToken);
      return new KnowledgeBaseServiceFactory(
        ai,
        this.app.container.resolve(fileStorageFactoryToken),
        this.app.container.resolve(queueManagerToken),
        this.app.container.resolve(repositoryFactoryToken),
        allowedStorageDisks,
      );
    });
  }

  public override boot(): Promise<void> {
    const ai = this.app.container.resolve(aiManagerToken);
    const repositories = this.app.container.resolve(repositoryFactoryToken);
    const services = this.app.container.resolve(serviceFactoryToken);
    const managers = services.managers;
    const executor = services.vectorization;
    bindKnowledgeBaseVectorizationExecutor(executor);
    this.boundExecutor = executor;

    const vectorDatabaseProvider = new VectorDatabaseProviderFeatureImpl();
    const vectorStoreProvider = new VectorStoreProviderFeatureImpl();
    this.vectorProvider = new PGVectorProvider();

    ai.features.enableFeatures({
      vectorDatabase: new VectorDatabaseFeatureImpl(
        repositories.vectorDatabases,
      ),
      vectorDatabaseProvider,
      vectorStoreProvider,
      knowledgeBase: new KnowledgeBaseFeatureImpl(
        ai,
        repositories.knowledgeBases,
        repositories.vectorStoreConfigs,
        managers.segments,
      ),
    });
    ai.features.vectorDatabaseProvider.register({
      name: PG_VECTOR_PROVIDER_NAME,
      spec: 'PGVector',
      provider: this.vectorProvider,
    });
    this.registerBuiltInVectorStoreProviders(ai, managers);
    this.featuresEnabled = true;
    return Promise.resolve();
  }

  public override async shutdown(): Promise<void> {
    if (this.featuresEnabled) {
      this.app.container
        .resolve(aiManagerToken)
        .features.disableFeatures([...AI_FEATURE_KEYS]);
      this.featuresEnabled = false;
    }
    if (this.boundExecutor) {
      unbindKnowledgeBaseVectorizationExecutor(this.boundExecutor);
      this.boundExecutor = undefined;
    }
    this.app.container.resolveIfCreated(serviceFactoryToken)?.dispose();
    await this.vectorProvider?.dispose();
    this.vectorProvider = undefined;
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
    ai.features.vectorStoreProvider.register({
      providerName: LEGACY_LOCAL_VECTOR_STORE_PROVIDER_NAME,
      createVectorStoreService: (props) =>
        local.createVectorStoreService(props),
    });
    ai.features.vectorStoreProvider.register({
      providerName: LEGACY_READONLY_VECTOR_STORE_PROVIDER_NAME,
      createVectorStoreService: (props) =>
        readonly.createVectorStoreService(props),
    });
  }
}
