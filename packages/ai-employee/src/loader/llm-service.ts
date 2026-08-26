import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import type { RuntimeLogger } from '../runtime/context.js';
import { AIManager } from '../manager/index.js';
import type { LLMServiceOptions } from '../manager/llm-service/types.js';
import { LoadAndRegister } from './types.js';

const LLM_MODELS_FILE = 'models.json';

export type LLMServiceLoaderOptions = {
  directory: string;
  logger?: RuntimeLogger;
};

/** Loads the fixed `ai/models.json` service manifest into LLMServiceManager. */
export class LLMServiceLoader extends LoadAndRegister<LLMServiceLoaderOptions> {
  protected services: LLMServiceOptions[] = [];

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

      definitions.forEach((definition, index) => {
        if (!isLLMServiceOptions(definition)) {
          this.options.logger?.warn?.(
            { file, index },
            'AI LLM service loader ignored invalid definition',
          );
          return;
        }
        this.services.push(definition);
      });
    } catch (error) {
      this.options.logger?.error?.(
        { file, error },
        'AI LLM service loader failed to read manifest',
      );
    }
  }

  protected async register(): Promise<void> {
    for (const service of this.services) {
      await this.ai.llmServiceManager.registerLLMService(service);
      this.options.logger?.info?.(`LLM service [${service.name}] registered`);
    }
  }
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
