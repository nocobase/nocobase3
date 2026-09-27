import type {
  EnabledModelsConfig,
  LLMServiceManager,
  LLMServiceOptions,
} from '@nocobase/ai-employee';
import { normalizeEnabledModelsConfig } from '@nocobase/ai-employee';
import type { Logger } from '@nocobase/logging';

import type {
  AIApplicationConfig,
  AIEmployeeLLMServiceConfig,
} from '../config.js';

/** `ai.llmServices`: each configured service, keyed by its name. */
export type LLMServiceConfigMap = AIApplicationConfig['llmServices'];

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

/**
 * A configured service plus the one decision the manager does not take: whether
 * `config.yml` reapplies its model list over what an administrator curated.
 */
export type NormalizedLLMServiceConfig = LLMServiceOptions & {
  readonly overrideEnabledModels?: boolean;
};

export class LLMServiceConfigSynchronizer {
  private queue: Promise<unknown> = Promise.resolve();

  public constructor(
    private readonly manager: LLMServiceManager,
    private readonly logger?: Logger,
  ) {}

  public enqueue(
    services: LLMServiceConfigMap | undefined,
  ): Promise<LLMServiceSyncSummary> {
    const operation = this.queue.then(() => this.synchronize(services));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  public async synchronize(
    services: LLMServiceConfigMap | undefined,
  ): Promise<LLMServiceSyncSummary> {
    const normalized = normalizeLLMServiceConfig(services);
    const existing = await this.manager.listLLMServices();
    const existingByName = new Map(
      existing.map((service) => [service.name, service]),
    );
    const configuredNames = new Set(normalized.map((service) => service.name));
    let created = 0;
    let updated = 0;

    for (const { overrideEnabledModels, ...service } of normalized) {
      const current = existingByName.get(service.name);
      const configuredService = current
        ? {
            ...service,
            title: service.title ?? service.name,
            options: service.options ?? {},
            modelOptions: service.modelOptions ?? DEFAULT_MODEL_OPTIONS,
            sort: service.sort ?? 0,
            // Reapplying the model list must not also reset the enable switch,
            // which is a separate administrator decision.
            ...(overrideEnabledModels === true
              ? { enabled: current.enabled }
              : {}),
          }
        : service;
      await this.manager.registerLLMService(configuredService, {
        preserveUserState: overrideEnabledModels !== true,
      });
      if (current) updated += 1;
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
    this.logger?.[created || updated || deleted ? 'info' : 'debug']?.(
      summary,
      'AI LLM services synchronized from application config',
    );
    return summary;
  }
}

export function normalizeLLMServiceConfig(
  services: LLMServiceConfigMap | undefined,
): NormalizedLLMServiceConfig[] {
  const values: unknown = services ?? {};
  if (Array.isArray(values)) {
    throw new Error(
      'Invalid ai.llmServices config: expected a map keyed by service name, such as `openai: { provider: openai }`. The list form is no longer read; move each entry under its name and drop the `name` field.',
    );
  }
  if (!isRecord(values)) {
    throw new Error(
      'Invalid ai.llmServices config: expected a map keyed by service name.',
    );
  }

  return Object.entries(values).map(([name, service]) => {
    assertLLMServiceConfig(service, name);
    return {
      ...service,
      name,
      enabledModels: normalizeConfiguredEnabledModels(service.enabledModels),
    };
  });
}

function normalizeConfiguredEnabledModels(
  value: AIEmployeeLLMServiceConfig['enabledModels'],
): EnabledModelsConfig | undefined {
  if (value === undefined) return undefined;
  return normalizeEnabledModelsConfig({ mode: 'custom', models: [...value] });
}

function assertLLMServiceConfig(
  value: unknown,
  name: string,
): asserts value is AIEmployeeLLMServiceConfig {
  const path = `ai.llmServices.${name}`;
  if (name.trim().length === 0) {
    throw new Error(
      'Invalid ai.llmServices config: a service name must not be empty.',
    );
  }
  if (!isRecord(value)) {
    throw new Error(`Invalid ${path}: expected an object.`);
  }
  if (value.name !== undefined) {
    throw new Error(
      `Invalid ${path}.name: the service name is its key in ai.llmServices; remove this field.`,
    );
  }
  assertNonEmptyString(value.provider, `${path}.provider`);
  assertOptionalString(value.title, `${path}.title`);
  assertOptionalRecord(value.options, `${path}.options`);
  assertEnabledModels(value.enabledModels, `${path}.enabledModels`);
  assertOptionalRecord(value.modelOptions, `${path}.modelOptions`);
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    throw new Error(`Invalid ${path}.enabled: expected a boolean.`);
  }
  if (value.sort !== undefined && typeof value.sort !== 'number') {
    throw new Error(`Invalid ${path}.sort: expected a number.`);
  }
  if (
    value.overrideEnabledModels !== undefined &&
    typeof value.overrideEnabledModels !== 'boolean'
  ) {
    throw new Error(
      `Invalid ${path}.overrideEnabledModels: expected a boolean.`,
    );
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
