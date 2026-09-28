/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  LLMProviderMeta,
  SupportedModel,
} from '../../manager/llm-provider/types.js';
import { OpenAICompletionsProvider } from './completions.js';
import { OpenAiEmbeddingProvider as embedding } from './embedding.js';
import { OpenAIResponsesProvider } from './responses.js';

const commonProperties: Pick<LLMProviderMeta, 'supportedModel' | 'models'> = {
  supportedModel: [SupportedModel.LLM, SupportedModel.EMBEDDING],
  models: {
    [SupportedModel.EMBEDDING]: [
      'text-embedding-3-small',
      'text-embedding-3-large',
      'text-embedding-ada-002',
    ],
  },
};

export const openaiResponsesProviderOptions: LLMProviderMeta = {
  ...commonProperties,
  embedding,
  title: 'OpenAI',
  provider: OpenAIResponsesProvider,
  supportWebSearch: true,
};

export const openaiCompletionsProviderOptions: LLMProviderMeta = {
  ...commonProperties,
  embedding,
  title: 'OpenAI (completions)',
  provider: OpenAICompletionsProvider,
};
