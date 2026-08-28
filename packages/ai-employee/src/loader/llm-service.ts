import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import type { Logger } from '@nocobase/logging';
import { AIManager } from '../manager/index.js';
import {
  normalizeEnabledModelsConfig,
  type LLMServiceOptions,
} from '../manager/llm-service/types.js';
import { LoadAndRegister } from './types.js';

const LLM_MODELS_FILE = 'models.json';

export type LLMServiceLoaderOptions = {
  directory: string;
  logger?: Logger;
  preserveUserState?: boolean;
  replaceExisting?: boolean;
};

/** Loads the fixed `ai/models.json` service manifest into LLMServiceManager. */
export class LLMServiceLoader extends LoadAndRegister<LLMServiceLoaderOptions> {
  protected services: LLMServiceOptions[] = [];
  protected manifestLoaded = false;

  constructor(
    protected readonly ai: AIManager,
    protected readonly options: LLMServiceLoaderOptions,
  ) {
    super(ai, options);
  }

  protected async scan(): Promise<void> {
    // The manifest path is fixed; there is no directory scan or per-service file discovery.
  }

  protected async import(): Promise<void> {
    this.services = [];
    this.manifestLoaded = false;
    const file = path.join(this.options.directory, LLM_MODELS_FILE);
    if (!existsSync(file)) return;

    try {
      const definitions = expandEnvironmentReferences(
        JSON.parse(await readFile(file, 'utf8')),
      );
      if (!Array.isArray(definitions)) {
        this.options.logger?.warn?.(
          { file },
          'AI LLM service loader ignored manifest that is not an array',
        );
        return;
      }
      this.manifestLoaded = true;
      definitions.forEach((definition, index) => {
        if (!isLLMServiceOptions(definition)) {
          this.options.logger?.warn?.(
            { file, index },
            'AI LLM service loader ignored invalid definition',
          );
          return;
        }
        this.services.push({
          ...definition,
          enabledModels: normalizeResourceEnabledModels(
            definition.enabledModels,
          ),
        });
      });
    } catch (error) {
      this.options.logger?.error?.(
        { file, error },
        'AI LLM service loader failed to read manifest',
      );
    }
  }

  protected async register(): Promise<void> {
    if (this.options.replaceExisting && this.manifestLoaded) {
      const serviceNames = new Set(
        this.services.map((service) => service.name),
      );
      const existingServices =
        await this.ai.llmServiceManager.listLLMServices();
      for (const service of existingServices) {
        if (!serviceNames.has(service.name)) {
          await this.ai.llmServiceManager.deleteLLMService(service.name);
        }
      }
    }
    for (const service of this.services) {
      await this.ai.llmServiceManager.registerLLMService(service, {
        preserveUserState: this.options.preserveUserState ?? true,
      });
      this.options.logger?.info?.(`LLM service [${service.name}] registered`);
    }
  }
}

export function normalizeResourceEnabledModels(
  value: LLMServiceOptions['enabledModels'],
): LLMServiceOptions['enabledModels'] {
  return normalizeEnabledModelsConfig(value);
}
function isLLMServiceOptions(value: unknown): value is LLMServiceOptions {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as LLMServiceOptions).name === 'string' &&
    Boolean((value as LLMServiceOptions).name) &&
    typeof (value as LLMServiceOptions).provider === 'string' &&
    Boolean((value as LLMServiceOptions).provider)
  );
}

export function expandEnvironmentReferences<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (_match, name: string) => process.env[name] ?? '',
    ) as T;
  }
  if (Array.isArray(value))
    return value.map((item) => expandEnvironmentReferences(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        expandEnvironmentReferences(item),
      ]),
    ) as T;
  }
  return value;
}
