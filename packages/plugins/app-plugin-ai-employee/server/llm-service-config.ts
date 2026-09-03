import type {
  EnabledModelsConfig,
  LLMServiceManager,
  LLMServiceOptions,
} from '@nocobase/ai-employee';
import { normalizeEnabledModelsConfig } from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';

import type { AIEmployeeLLMServiceConfig } from './config.js';

const DEFAULT_MODEL_OPTIONS: Readonly<Record<string, unknown>> = {
  temperature: 1,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

export interface LLMServiceSyncSummary {
  readonly configured: number;
  readonly created: number;
  readonly updated: number;
  readonly deleted: number;
}

export class LLMServiceConfigSynchronizer {
  private queue: Promise<unknown> = Promise.resolve();

  public constructor(
    private readonly manager: LLMServiceManager,
    private readonly logger?: Logger,
  ) {}

  public enqueue(
    services: readonly AIEmployeeLLMServiceConfig[] | undefined,
  ): Promise<LLMServiceSyncSummary> {
    const operation = this.queue.then(() => this.synchronize(services));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  public async synchronize(
    services: readonly AIEmployeeLLMServiceConfig[] | undefined,
  ): Promise<LLMServiceSyncSummary> {
    const normalized = normalizeLLMServiceConfig(services);
    const existing = await this.manager.listLLMServices();
    const existingNames = new Set(existing.map((service) => service.name));
    const configuredNames = new Set(normalized.map((service) => service.name));
    let created = 0;
    let updated = 0;

    for (const service of normalized) {
      const configuredService = existingNames.has(service.name)
        ? {
            ...service,
            title: service.title ?? service.name,
            options: service.options ?? {},
            modelOptions: service.modelOptions ?? DEFAULT_MODEL_OPTIONS,
            sort: service.sort ?? 0,
          }
        : service;
      await this.manager.registerLLMService(configuredService, {
        preserveUserState: true,
      });
      if (existingNames.has(service.name)) updated += 1;
      else created += 1;
    }

    let deleted = 0;
    for (const service of existing) {
      if (configuredNames.has(service.name)) continue;
      await this.manager.deleteLLMService(service.name);
      deleted += 1;
    }

    const summary: LLMServiceSyncSummary = {
      configured: normalized.length,
      created,
      updated,
      deleted,
    };
    this.logger?.info?.(
      summary,
      'AI LLM services synchronized from application config',
    );
    return summary;
  }
}

export function normalizeLLMServiceConfig(
  services: readonly AIEmployeeLLMServiceConfig[] | undefined,
): LLMServiceOptions[] {
  const values = services ?? [];
  if (!Array.isArray(values)) {
    throw new Error('Invalid ai.llmServices config: expected an array.');
  }

  const names = new Set<string>();
  const normalized: LLMServiceOptions[] = [];
  for (const [index, service] of values.entries()) {
    assertLLMServiceConfig(service, index);
    if (names.has(service.name)) {
      throw new Error(
        `Invalid ai.llmServices config: duplicate service name "${service.name}".`,
      );
    }
    names.add(service.name);
    const expanded = expandEnvironmentReferences(service);
    normalized.push({
      ...expanded,
      enabledModels: normalizeConfiguredEnabledModels(expanded.enabledModels),
    });
  }
  return normalized;
}

export function expandEnvironmentReferences<T>(value: T): T {
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
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        expandEnvironmentValue(item),
      ]),
    );
  }
  return value;
}

function normalizeConfiguredEnabledModels(
  value: AIEmployeeLLMServiceConfig['enabledModels'],
): EnabledModelsConfig | undefined {
  if (value === undefined) return undefined;
  return normalizeEnabledModelsConfig({ mode: 'custom', models: [...value] });
}

function assertLLMServiceConfig(
  value: unknown,
  index: number,
): asserts value is AIEmployeeLLMServiceConfig {
  if (!isRecord(value)) {
    throw new Error(`Invalid ai.llmServices.${index}: expected an object.`);
  }
  assertNonEmptyString(value.name, `ai.llmServices.${index}.name`);
  assertNonEmptyString(value.provider, `ai.llmServices.${index}.provider`);
  assertOptionalString(value.title, `ai.llmServices.${index}.title`);
  assertOptionalRecord(value.options, `ai.llmServices.${index}.options`);
  assertEnabledModels(
    value.enabledModels,
    `ai.llmServices.${index}.enabledModels`,
  );
  assertOptionalRecord(
    value.modelOptions,
    `ai.llmServices.${index}.modelOptions`,
  );
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    throw new Error(
      `Invalid ai.llmServices.${index}.enabled: expected a boolean.`,
    );
  }
  if (value.sort !== undefined && typeof value.sort !== 'number') {
    throw new Error(`Invalid ai.llmServices.${index}.sort: expected a number.`);
  }
}

function assertEnabledModels(value: unknown, path: string): void {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    !value.every(
      (model) =>
        isRecord(model) &&
        typeof model.label === 'string' &&
        typeof model.value === 'string',
    )
  ) {
    throw new Error(`Invalid ${path}: expected label/value entries.`);
  }
}

function assertNonEmptyString(value: unknown, path: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${path}: expected a non-empty string.`);
  }
}

function assertOptionalString(value: unknown, path: string): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`Invalid ${path}: expected a string.`);
  }
}

function assertOptionalRecord(value: unknown, path: string): void {
  if (value !== undefined && !isRecord(value)) {
    throw new Error(`Invalid ${path}: expected an object.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
