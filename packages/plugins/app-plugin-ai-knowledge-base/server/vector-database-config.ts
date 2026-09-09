import { createHash } from 'node:crypto';

import type { AIManager } from '@nocobase/ai-employee';
import type { AIKnowledgeBaseVectorDatabaseConfig } from '@nocobase/app-plugin-ai-employee/server/config';

import { PG_VECTOR_PROVIDER_NAME } from './extensions/vector-database/pg-vector-provider.js';
import type { KnowledgeBaseWarningLogger } from './internal-types.js';
import type {
  KnowledgeBaseRepository,
  VectorDatabaseEntity,
  VectorDatabaseRepository,
} from './repository/index.js';

export interface VectorDatabaseConfigSyncSummary {
  readonly configured: number;
  readonly created: number;
  readonly updated: number;
  readonly deleted: number;
  readonly retained: number;
  readonly conflicted: number;
}

export function hashVectorDatabaseConnection(
  connection: Record<string, unknown>,
): string {
  return createHash('sha256').update(JSON.stringify(connection)).digest('hex');
}

export interface NormalizedVectorDatabaseConfig {
  readonly name: string;
  readonly key: string;
  readonly provider: string;
  readonly databaseSpec: string;
  readonly connectProps: Record<string, unknown>;
  readonly enabled: boolean;
}

export function normalizeVectorDatabaseConfig(
  values: readonly AIKnowledgeBaseVectorDatabaseConfig[] | undefined,
): NormalizedVectorDatabaseConfig[] {
  if (values !== undefined && !Array.isArray(values)) {
    throw new Error(
      'Invalid ai.aiKnowledgeBase.vectorDatabases config: expected an array.',
    );
  }
  const names = new Set<string>();
  const entries: readonly unknown[] = values ?? [];
  return entries.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new Error(
        `Invalid ai.aiKnowledgeBase.vectorDatabases.${index}: expected an object.`,
      );
    }
    const expanded = expandEnvironmentReferences(raw);
    const name = requireText(
      expanded.name,
      `ai.aiKnowledgeBase.vectorDatabases.${index}.name`,
    );
    if (names.has(name)) {
      throw new Error(
        `Invalid ai.aiKnowledgeBase.vectorDatabases config: duplicate name "${name}".`,
      );
    }
    names.add(name);
    const connection = expanded.connection;
    if (!isRecord(connection)) {
      throw new Error(
        `Invalid ai.aiKnowledgeBase.vectorDatabases.${index}.connection: expected an object.`,
      );
    }
    return {
      name,
      key: name,
      provider: optionalText(expanded.provider) ?? PG_VECTOR_PROVIDER_NAME,
      databaseSpec: optionalText(expanded.databaseSpec) ?? 'PGVector',
      connectProps: { ...connection },
      enabled: expanded.enabled !== false,
    };
  });
}

export class VectorDatabaseConfigSynchronizer {
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  public constructor(
    private readonly ai: AIManager,
    private readonly vectors: VectorDatabaseRepository,
    private readonly bases: KnowledgeBaseRepository,
    private readonly warningLogger: KnowledgeBaseWarningLogger,
    private readonly onChanged?: () => void,
  ) {}

  public enqueue(
    values: readonly AIKnowledgeBaseVectorDatabaseConfig[] | undefined,
  ): Promise<VectorDatabaseConfigSyncSummary> {
    if (this.closed) {
      return Promise.reject(
        new Error('Vector database config synchronizer is closed'),
      );
    }
    const operation = this.queue.then(() => this.synchronize(values));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  public async close(): Promise<void> {
    this.closed = true;
    await this.queue;
  }

  public async synchronize(
    values: readonly AIKnowledgeBaseVectorDatabaseConfig[] | undefined,
  ): Promise<VectorDatabaseConfigSyncSummary> {
    const configured = normalizeVectorDatabaseConfig(values);
    for (const item of configured) {
      this.ai.features.vectorDatabaseProvider.validateConnectParams(
        item.provider,
        item.connectProps,
      );
    }

    const existing = await this.vectors.find({ sort: ['name'] });
    const protectedManagedIds = new Set<VectorDatabaseEntity['id']>();
    let created = 0;
    let updated = 0;
    let deleted = 0;
    let retained = 0;
    let conflicted = 0;

    for (const item of configured) {
      const matches = existing.filter(
        (candidate) =>
          candidate.name === item.name || candidate.key === item.key,
      );
      const manualMatch = matches.find(
        (candidate) => candidate.managedBy !== 'config',
      );
      if (manualMatch) {
        for (const candidate of matches) {
          if (candidate.managedBy === 'config') {
            protectedManagedIds.add(candidate.id);
          }
        }
        conflicted += 1;
        this.warningLogger.warn(
          'Configured vector database conflicts with a manually managed record.',
          {
            name: item.name,
            key: item.key,
            vectorDatabaseId: manualMatch.id,
          },
        );
        continue;
      }
      const match =
        matches.find((candidate) => candidate.key === item.key) ?? matches[0];
      if (match) protectedManagedIds.add(match.id);
      const connectionHash = hashVectorDatabaseConnection(item.connectProps);
      const valuesToPersist: Partial<VectorDatabaseEntity> = {
        key: item.key,
        name: item.name,
        provider: item.provider,
        databaseSpec: item.databaseSpec,
        connectProps: item.connectProps,
        connectPropsHash: connectionHash,
        enabled: item.enabled,
        managedBy: 'config',
      };
      if (match) {
        const unchanged =
          match.key === item.key &&
          match.name === item.name &&
          match.provider === item.provider &&
          match.databaseSpec === item.databaseSpec &&
          match.connectPropsHash === connectionHash &&
          match.enabled === item.enabled &&
          match.managedBy === 'config';
        if (!unchanged) {
          await this.vectors.update({ id: match.id }, valuesToPersist);
          updated += 1;
        }
      } else {
        await this.vectors.create(valuesToPersist, { key: item.key });
        created += 1;
      }
    }

    for (const item of existing) {
      if (item.managedBy !== 'config' || protectedManagedIds.has(item.id)) {
        continue;
      }
      const related = await this.bases.find({
        filter: { vectorDatabaseKey: item.key },
      });
      if (related.length) {
        retained += 1;
        this.warningLogger.warn(
          'Configured vector database was removed from config but is still referenced.',
          {
            name: item.name,
            key: item.key,
            knowledgeBaseKeys: related.map((base) => base.key),
          },
        );
        continue;
      }
      await this.vectors.destroy({ id: item.id });
      deleted += 1;
    }

    if (created + updated + deleted > 0) this.onChanged?.();

    return {
      configured: configured.length,
      created,
      updated,
      deleted,
      retained,
      conflicted,
    };
  }
}

function expandEnvironmentReferences<T>(value: T): T {
  return expandEnvironmentValue(value) as T;
}

function expandEnvironmentValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (_match, name: string) => process.env[name] ?? '',
    );
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => expandEnvironmentValue(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        expandEnvironmentValue(item),
      ]),
    );
  }
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, path: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`Invalid ${path}: expected a non-empty string.`);
  return text;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
