/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { AIMessageChunk } from '@langchain/core/messages';
import _ from 'lodash';
import {
  LLMProvider,
  ReasoningOptions,
  ResolvedReasoningOptions,
} from '../provider.js';
import {
  LLMProviderMeta,
  SupportedModel,
} from '../../manager/llm-provider/types.js';
import { CachedDocumentLoader } from '../../manager/ai-employee/document-loader/plugin/index.js';
import { KimiDocumentLoader } from './document-loader.js';
import { ReasoningChatOpenAI } from '../common/reasoning.js';
import { AIFileAttachment } from '../../runtime/types/ai-file-attachment.js';

const KIMI_THINKING_SWITCH_MODELS = new Set(['kimi-k2.5', 'kimi-k2.6']);

export class KimiProvider extends LLMProvider {
  declare chatModel: ReasoningChatOpenAI;
  private _documentLoader: CachedDocumentLoader | undefined;

  get baseURL() {
    return 'https://api.moonshot.cn/v1';
  }

  createModel() {
    const { apiKey } = this.serviceOptions || {};
    const { responseFormat, structuredOutput } = this.modelOptions || {};
    const { name, schema } = structuredOutput || {};
    const reasoningOptions = this.resolveReasoningOptions(
      this.modelReasoningOptions,
    );
    const responseFormatOptions: Record<string, any> = {
      type: responseFormat ?? 'text',
    };
    if (responseFormat === 'json_schema' && schema) {
      responseFormatOptions['json_schema'] = { schema, name: name ?? 'schema' };
    }
    return new ReasoningChatOpenAI({
      apiKey,
      ...this.modelOptions,
      modelKwargs: {
        response_format: responseFormatOptions,
        ...(reasoningOptions.modelKwargs || {}),
      },
      ...(reasoningOptions.modelRequestParams || {}),
      configuration: {
        baseURL: this.getResolvedBaseURL(),
      },
    });
  }

  parseResponseMessage(message: any) {
    const result = super.parseResponseMessage(message);
    if (['user', 'tool'].includes(result?.role)) {
      return result;
    }
    const { metadata } = message ?? {};
    if (!_.isEmpty(metadata?.additional_kwargs?.reasoning_content)) {
      result.content = {
        ...(result.content ?? {}),
        reasoning: {
          status: 'stop',
          content: metadata?.additional_kwargs.reasoning_content,
        },
      };
    }
    return result;
  }

  parseReasoningContent(chunk: AIMessageChunk): {
    status: string;
    content: string;
  } {
    if (!_.isEmpty(chunk?.additional_kwargs?.reasoning_content)) {
      return {
        status: 'streaming',
        content: chunk.additional_kwargs.reasoning_content as string,
      };
    }
    return null;
  }

  protected resolveReasoningOptions(
    reasoning?: ReasoningOptions,
  ): ResolvedReasoningOptions {
    if (!reasoning || reasoning.mode === 'default') {
      return {};
    }
    if (!KIMI_THINKING_SWITCH_MODELS.has(this.modelOptions?.model)) {
      return {};
    }
    return {
      modelKwargs: {
        thinking: {
          type: reasoning.mode === 'off' ? 'disabled' : 'enabled',
        },
      },
    };
  }

  protected isApiSupportedAttachment(attachment: AIFileAttachment): boolean {
    return attachment.mimetype?.startsWith('image/') ?? false;
  }

  protected get documentLoader(): CachedDocumentLoader {
    if (!this._documentLoader) {
      const loader = new KimiDocumentLoader(this.context.fileManager, {
        apiKey: this.serviceOptions?.apiKey,
        baseURL: this.getResolvedBaseURL(),
      });
      this._documentLoader = new CachedDocumentLoader(this.context, {
        loader,
        parserVersion: 'kimi-v1',
        parsedMimetype: 'application/json',
        parsedFileExtname: 'json',
        supports: () => true,
      });
    }

    return this._documentLoader;
  }
}

export const kimiProviderOptions: LLMProviderMeta = {
  title: 'Kimi',
  supportedModel: [SupportedModel.LLM],
  models: {
    [SupportedModel.LLM]: [
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
      'kimi-k2.6',
      'kimi-k2.5',
    ],
  },
  provider: KimiProvider,
};
