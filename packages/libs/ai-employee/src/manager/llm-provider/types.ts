/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type {
  EmbeddingProvider,
  EmbeddingProviderOptions,
  LLMProvider,
  LLMProviderOptions,
  ReasoningOptions,
} from '../../llm-providers/provider.js';

export type LLMProviderMeta = {
  title: string;
  supportedModel?: SupportedModel[];
  models?: Partial<Record<SupportedModel, string[]>>;
  provider: new (opts: LLMProviderOptions) => LLMProvider;
  embedding?: new (opts: EmbeddingProviderOptions) => EmbeddingProvider;
  supportWebSearch?: boolean;
  webSearchModels?: string[];
};

export enum SupportedModel {
  LLM = 'LLM',
  EMBEDDING = 'EMBEDDING',
}

export type LLMModelOptions = {
  llmService: string;
  model: string;
  webSearch?: boolean;
  reasoning?: ReasoningOptions;
};

export type EnabledLLMModel = {
  label: string;
  value: string;
};

export type EnabledLLMService = {
  llmService: string;
  llmServiceTitle: string;
  provider: string;
  providerTitle?: string;
  enabledModels: EnabledLLMModel[];
  supportWebSearch: boolean;
  webSearchModels?: string[];
  isToolConflict: boolean;
};
