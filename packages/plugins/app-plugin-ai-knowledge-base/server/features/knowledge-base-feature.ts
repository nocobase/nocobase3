import type {
  AIManager,
  DocumentSegmentedWithScore,
  KnowledgeBase,
  KnowledgeBaseFeature,
  KnowledgeBaseGroup,
  SearchOptions,
} from '@nocobase/ai-employee';

import type {
  KnowledgeBaseRecord,
  VectorStoreConfigRecord,
} from '../internal-types.js';
import type { KnowledgeBaseSegmentManager } from '../managers/knowledge-base-segment-manager.js';
import type { TableRepository } from '../repositories/table-repository.js';

export class KnowledgeBaseFeatureImpl implements KnowledgeBaseFeature {
  public constructor(
    private readonly ai: AIManager,
    private readonly bases: TableRepository<KnowledgeBaseRecord>,
    private readonly vectorStoreConfigs: TableRepository<VectorStoreConfigRecord>,
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

  public async getKnowledgeBaseGroup(
    keys: string[],
  ): Promise<KnowledgeBaseGroup[]> {
    const rows = await this.getKnowledgeBase(keys);
    const groups = new Map<string, KnowledgeBaseGroup>();
    for (const row of rows) {
      const groupKey = JSON.stringify({
        knowledgeBaseType: row.knowledgeBaseType,
        vectorStoreProvider: row.vectorStoreProvider,
        vectorDatabaseKey: row.vectorDatabaseKey,
        llmService: row.llmService,
        embeddingModel: row.embeddingModel,
      });
      const group = groups.get(groupKey) ?? {
        vectorStoreConfig: {
          vectorStoreProvider: row.vectorStoreProvider,
          vectorDatabaseKey: row.vectorDatabaseKey,
          llmService: row.llmService,
          embeddingModel: row.embeddingModel,
        },
        knowledgeBaseType: row.knowledgeBaseType,
        knowledgeBaseList: [],
      };
      group.knowledgeBaseList.push(row);
      groups.set(groupKey, group);
    }
    return [...groups.values()];
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
    const localGroups = new Map<string, KnowledgeBaseRecord[]>();

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
    base: KnowledgeBaseRecord,
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
    row: KnowledgeBaseRecord,
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
