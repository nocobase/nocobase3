import type {
  AIManager,
  DocumentSegmentedWithScore,
  KnowledgeBase,
  KnowledgeBaseFeature,
  SearchOptions,
} from '@nocobase/ai-employee';

import type { KnowledgeBaseSegmentManager } from '../managers/knowledge-base-segment-manager.js';
import type {
  KnowledgeBaseEntity,
  KnowledgeBaseRepository,
  VectorStoreConfigRepository,
} from '../repository/index.js';

export class KnowledgeBaseFeatureImpl implements KnowledgeBaseFeature {
  public constructor(
    private readonly ai: AIManager,
    private readonly bases: KnowledgeBaseRepository,
    private readonly vectorStoreConfigs: VectorStoreConfigRepository,
    private readonly segments: KnowledgeBaseSegmentManager,
    private readonly renderVectorStoreProps: <T>(value: T) => T = (value) =>
      value,
  ) {}

  public async getKnowledgeBase(keys: string[]): Promise<KnowledgeBase[]> {
    if (!keys.length) return [];
    const rows = await this.bases.find({
      filter: { key: { $in: keys.map(String) } },
    });
    return Promise.all(rows.map((row) => this.toKnowledgeBase(row)));
  }

  public async search(
    options: SearchOptions,
  ): Promise<DocumentSegmentedWithScore[]> {
    if (!options.knowledgeBaseKeys.length) return [];
    const rows = await this.bases.find({
      filter: {
        key: { $in: options.knowledgeBaseKeys },
        enabled: true,
      },
    });
    const output: DocumentSegmentedWithScore[] = [];
    const localGroups = new Map<string, KnowledgeBaseEntity[]>();

    for (const base of rows) {
      if (base.knowledgeBaseType === 'LOCAL') {
        if (!base.vectorStoreConfigKey) continue;
        const group = localGroups.get(base.vectorStoreConfigKey) ?? [];
        group.push(base);
        localGroups.set(base.vectorStoreConfigKey, group);
        continue;
      }
      const result = await this.searchBase(base, options);
      output.push(...result);
    }

    for (const [configKey, bases] of localGroups) {
      const service =
        await this.ai.features.vectorStoreProvider.createVectorStoreService(
          bases[0].vectorStoreProvider,
          [{ key: 'vectorStoreConfigKey', value: configKey }],
        );
      const result = await service.search(options.query, {
        topK: options.topK,
        score: options.score,
        filter: {
          knowledgeBaseOuterId: {
            in: bases.map((base) => base.knowledgeBaseOuterId),
          },
        },
      });
      output.push(...(await this.segments.mergeLocalSearchResults(result)));
    }

    return output.sort((left, right) => right.score - left.score);
  }

  private async searchBase(
    base: KnowledgeBaseEntity,
    options: SearchOptions,
  ): Promise<DocumentSegmentedWithScore[]> {
    const props =
      base.knowledgeBaseType === 'EXTERNAL'
        ? this.renderVectorStoreProps(base.vectorStoreProps ?? [])
        : [
            {
              key: 'vectorStoreConfigKey',
              value: base.vectorStoreConfigKey,
            },
          ];
    const service =
      await this.ai.features.vectorStoreProvider.createVectorStoreService(
        base.vectorStoreProvider,
        props,
      );
    return service.search(options.query, {
      topK: options.topK,
      score: options.score,
    });
  }

  private async toKnowledgeBase(
    row: KnowledgeBaseEntity,
  ): Promise<KnowledgeBase> {
    const config = row.vectorStoreConfigKey
      ? await this.vectorStoreConfigs.findOne({ key: row.vectorStoreConfigKey })
      : null;
    return {
      knowledgeBaseType: row.knowledgeBaseType,
      knowledgeBaseOuterId: row.knowledgeBaseOuterId,
      key: row.key,
      name: row.name,
      description: row.description ?? '',
      vectorStoreProvider: row.vectorStoreProvider,
      vectorDatabaseKey: config?.vectorDatabaseKey,
      llmService: config?.llmService,
      embeddingModel: config?.embeddingModel,
      vectorStoreProps: row.vectorStoreProps,
      enabled: row.enabled,
    };
  }
}
