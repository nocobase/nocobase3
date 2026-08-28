/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AIFileAttachment } from '../types/ai-file-attachment.js';
import {
  checkUrlAgainstWhitelist,
  serverRequest,
} from '../utils/server-request.js';
import {
  AIChatContext,
  AIMessageInput,
} from '../types/ai-chat-conversation.type.js';
import { buildTool } from '../utils/tools.js';
import { encodeReadableStream } from '../utils/streams.js';
import { parseResponseMessage, stripToolCallTags } from '../utils/messages.js';
import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import type { FileManager } from '../manager/file/index.js';
import type { Caching } from '@nocobase/caching';
import '@langchain/core/utils/stream';
import { LLMResult } from '@langchain/core/outputs';
import { ContentBlock } from '@langchain/core/messages';
import { SUPPORTED_DOCUMENT_EXTNAMES } from '../manager/document-loader/plugin/index.js';
import path from 'node:path';
import { MODEL_KWARGS_KEY } from './common/reasoning.js';

export type ParsedAttachmentResult = {
  placement: string;
  content: any;
};

export type LLMProviderInvokeOptions = {
  modelKwargs?: Record<string, any>;
  modelRequestParams?: Record<string, any>;
  [key: string]: any;
};

export type ReasoningMode =
  'default' | 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type ReasoningOptions = {
  mode: ReasoningMode;
};

export type ResolvedReasoningOptions = Pick<
  LLMProviderInvokeOptions,
  'modelKwargs' | 'modelRequestParams'
>;

export type LLMModelRequestBuilderResult = {
  context: AIChatContext;
  options?: LLMProviderInvokeOptions;
};

export type LLMModelRequestBuilder = (input: {
  context: AIChatContext;
  options?: LLMProviderInvokeOptions;
}) => LLMModelRequestBuilderResult;

export interface LLMProviderOptions {
  serviceOptions?: Record<string, any>;
  modelOptions?: Record<string, any>;
}

export interface AttachmentDocumentLoader {
  load(
    attachment: AIFileAttachment,
    options?: Record<string, unknown>,
  ): Promise<{ supported: boolean; text: string }>;
}

export interface AttachmentParseRuntime {
  fileManager: FileManager;
  documentLoader: AttachmentDocumentLoader;
  caching?: Caching;
  getHeader?(name: string): string | undefined;
}

function assertBaseURLString(baseURL: unknown): asserts baseURL is string {
  if (typeof baseURL !== 'string') {
    throw new Error('baseURL must be a string');
  }
}

function normalizeBaseURL(baseURL: unknown): string {
  assertBaseURLString(baseURL);
  const trimmedBaseURL = baseURL.trim();
  checkUrlAgainstWhitelist(trimmedBaseURL);
  return new URL(trimmedBaseURL).toString().replace(/\/$/, '');
}

function isBlankBaseURL(baseURL: string): boolean {
  return baseURL.trim() === '';
}

function getServiceBaseURL(serviceOptions?: Record<string, any>): unknown {
  const baseURL = serviceOptions?.baseURL;
  if (typeof baseURL === 'string' && isBlankBaseURL(baseURL)) {
    return null;
  }
  return baseURL;
}

function resolveServiceOptions(
  serviceOptions: Record<string, any> | undefined,
) {
  const rendered = { ...(serviceOptions ?? {}) };
  if (rendered?.baseURL != null) {
    assertBaseURLString(rendered.baseURL);
    if (isBlankBaseURL(rendered.baseURL)) {
      delete rendered.baseURL;
      return rendered;
    }
    rendered.baseURL = normalizeBaseURL(rendered.baseURL);
  }
  return rendered;
}

export abstract class LLMProvider {
  serviceOptions: Record<string, any>;
  modelOptions: Record<string, any> | undefined;
  chatModel: any;
  protected modelReasoningOptions: ReasoningOptions | undefined;

  abstract createModel(): BaseChatModel | any;

  get baseURL(): string | null {
    return null;
  }

  constructor(opts: LLMProviderOptions) {
    const { serviceOptions, modelOptions } = opts;
    this.serviceOptions = resolveServiceOptions(serviceOptions);
    if (modelOptions) {
      const { _reasoning, ...restModelOptions } = modelOptions;
      this.modelReasoningOptions = _reasoning;
      this.modelOptions = restModelOptions;
      this.chatModel = this.createModel();
    }
  }

  protected getModelRequestBuilder(
    _model?: string,
  ): LLMModelRequestBuilder | null {
    return null;
  }

  protected resolveReasoningOptions(
    _reasoning?: ReasoningOptions,
  ): ResolvedReasoningOptions {
    return {};
  }

  prepareChain(context: AIChatContext) {
    let chain = this.chatModel;
    const toolDefinitions = context.tools?.map(buildTool);

    if (this.builtInTools()?.length) {
      const tools = [...this.builtInTools()];
      if (!this.isToolConflict() && toolDefinitions?.length) {
        tools.push(...toolDefinitions);
      }
      chain = chain.bindTools?.(tools);
    } else if (toolDefinitions?.length) {
      chain = chain.bindTools?.(toolDefinitions);
    }

    if (context.structuredOutput) {
      const { schema, options } =
        this.getStructuredOutputOptions(context.structuredOutput) || {};
      if (schema) {
        chain = chain.withStructuredOutput(schema, options);
      }
    }
    return chain;
  }

  async invoke(context: AIChatContext, options?: LLMProviderInvokeOptions) {
    const builder = this.getModelRequestBuilder(this.modelOptions?.model);
    const request = builder?.({ context, options }) || { context, options };
    const chain = this.prepareChain(request.context);
    const requestInvokeOptions = options?.signal
      ? {
          ...(request.options || {}),
          signal: request.options?.signal ?? options.signal,
        }
      : request.options;
    const {
      modelKwargs,
      modelRequestParams,
      options: requestOptions,
      ...restOptions
    } = requestInvokeOptions || {};
    const invokeOptions = modelKwargs
      ? {
          ...restOptions,
          [MODEL_KWARGS_KEY]: modelKwargs,
          options: {
            ...(requestOptions || {}),
            [MODEL_KWARGS_KEY]: modelKwargs,
          },
        }
      : {
          ...restOptions,
          ...(requestOptions ? { options: requestOptions } : {}),
        };
    return chain.invoke(request.context.messages, invokeOptions);
  }

  async stream(context: AIChatContext, options?: any) {
    const chain = this.prepareChain(context);
    return chain.streamEvents(context.messages, options);
  }

  async listModels(): Promise<{
    models?: { id: string }[];
    code?: number;
    errMsg?: string;
  }> {
    const options = this.serviceOptions || {};
    const apiKey = options.apiKey;
    let url: string;
    try {
      url = this.buildRequestURL('models');
    } catch (e) {
      return { code: 400, errMsg: e instanceof Error ? e.message : String(e) };
    }
    if (!apiKey) {
      return { code: 400, errMsg: 'API Key required' };
    }
    try {
      const res = await serverRequest({
        method: 'GET',
        url,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      return { models: res?.data.data };
    } catch (e) {
      const status = e.response?.status || 500;
      const data = e.response?.data;
      const errorMsg =
        data?.error?.message ||
        data?.message ||
        (typeof data?.error === 'string' ? data.error : undefined) ||
        (typeof data === 'string' ? data : undefined) ||
        e.response?.statusText ||
        e.message;
      return { code: status, errMsg: errorMsg };
    }
  }

  parseResponseMessage(message: any) {
    return parseResponseMessage(message);
  }

  parseResponseChunk(chunk: any) {
    return stripToolCallTags(chunk);
  }

  async parseAttachment(
    attachment: AIFileAttachment,
    runtime: AttachmentParseRuntime,
  ): Promise<ParsedAttachmentResult> {
    const dataSourceKey = attachment?.source?.dataSourceKey;
    const isExternalAttachment = Boolean(
      dataSourceKey && dataSourceKey !== 'main',
    );
    if (
      (!attachment?.storageId && !isExternalAttachment) ||
      !attachment?.filename
    ) {
      return {
        placement: 'system',
        content:
          'The user provided an attachment, but it is unavailable or invalid and cannot be parsed. Do not use this attachment as evidence; tell the user the attachment is unavailable.',
      };
    }
    if (this.isApiSupportedAttachment(attachment)) {
      return await this.convertToContent(attachment, runtime);
    }
    if (this.isDocumentLoaderSupportedAttachment(attachment)) {
      return await this.loadDocument(attachment, runtime);
    }
    const safeFilename = path.basename(attachment.filename);
    return {
      placement: 'system',
      content: `The user has uploaded a ${attachment.mimetype} file (filename: ${safeFilename}). Please inform the user directly that you do not support parsing ${attachment.mimetype} content.`,
    };
  }

  protected isApiSupportedAttachment(attachment: AIFileAttachment): boolean {
    const media = ['image/'];
    const pdf = ['application/pdf'];
    const supportedMedia = media.some((it) =>
      attachment?.mimetype?.startsWith(it),
    );
    const supportedPdf = pdf.some((it) => attachment?.mimetype?.includes(it));
    return supportedMedia || supportedPdf;
  }

  protected isDocumentLoaderSupportedAttachment(
    attachment: AIFileAttachment,
  ): boolean {
    const ext = path.extname(attachment?.filename ?? '').toLocaleLowerCase();
    return SUPPORTED_DOCUMENT_EXTNAMES.includes(ext);
  }

  protected async encodeAttachment(
    attachment: AIFileAttachment,
    runtime: AttachmentParseRuntime,
  ): Promise<string> {
    const referer = runtime.getHeader?.('referer') || '';
    const userAgent = runtime.getHeader?.('user-agent') || '';
    const options =
      referer || userAgent
        ? {
            requestOptions: {
              headers: {
                Referer: referer,
                'User-Agent': userAgent,
              },
            },
          }
        : undefined;
    const { stream } = await runtime.fileManager.getFileStream(
      attachment,
      options,
    );
    return await encodeReadableStream(stream);
  }

  protected async convertToContent(
    attachment: AIFileAttachment,
    runtime: AttachmentParseRuntime,
  ): Promise<ParsedAttachmentResult> {
    const data = await this.encodeAttachment(attachment, runtime);
    if (attachment.mimetype.startsWith('image/')) {
      return {
        placement: 'contentBlocks',
        content: {
          type: 'image_url',
          image_url: {
            url: `data:image/${attachment.mimetype.split('/')[1]};base64,${data}`,
          },
        },
      } as ParsedAttachmentResult;
    }
    return {
      placement: 'contentBlocks',
      content: {
        type: 'file',
        mimeType: attachment.mimetype,
        metadata: {
          filename: attachment.filename,
        },
        data,
      } as ContentBlock.Multimodal.File,
    } as ParsedAttachmentResult;
  }

  protected resolveDocumentLoader(
    runtime: AttachmentParseRuntime,
  ): AttachmentDocumentLoader {
    return runtime.documentLoader;
  }

  protected async loadDocument(
    attachment: AIFileAttachment,
    runtime: AttachmentParseRuntime,
  ): Promise<ParsedAttachmentResult> {
    const safeFilename = attachment.filename
      ? path.basename(attachment.filename)
      : 'document';
    const referer = runtime.getHeader?.('referer') || '';
    const userAgent = runtime.getHeader?.('user-agent') || '';
    const loaderOptions =
      referer || userAgent
        ? {
            requestOptions: {
              headers: {
                Referer: referer,
                'User-Agent': userAgent,
              },
            },
          }
        : undefined;
    const parsed = await this.resolveDocumentLoader(runtime).load(
      attachment,
      loaderOptions,
    );
    if (!parsed.supported) {
      return {
        placement: 'system',
        content: `File ${safeFilename} is not a supported document type for text parsing.`,
      };
    }
    if (parsed.text.length === 0) {
      return {
        placement: 'system',
        content: `The file provided by the user is an empty file, file name is "${safeFilename}"`,
      };
    }
    return {
      placement: 'system',
      content: `<parsed_document filename="${safeFilename}">\n${parsed.text}\n</parsed_document>`,
    };
  }

  getStructuredOutputOptions(
    structuredOutput: AIChatContext['structuredOutput'],
  ): any {
    const { responseFormat } = this.modelOptions || {};
    const { schema, name, description, strict } = structuredOutput || {};
    if (!schema) {
      return;
    }
    const methods: Record<string, string> = {
      json_object: 'jsonMode',
      json_schema: 'jsonSchema',
    };
    const options: Record<string, any> = {
      includeRaw: true,
      name,
      method: methods[responseFormat],
    };
    if (strict) {
      options['strict'] = strict;
      options['method'] = 'jsonSchema';
    }
    return {
      schema: {
        name,
        description,
        parameters: schema,
      },
      options,
    };
  }

  async testFlight(): Promise<{
    status: 'success' | 'error';
    code: number;
    message?: string;
  }> {
    try {
      const result = await this.chatModel.invoke('hello');
    } catch (error) {
      return {
        status: 'error',
        code: 1,
        message: error.message,
      };
    }
    return {
      status: 'success',
      code: 0,
    };
  }

  protected builtInTools(): any[] {
    return [];
  }

  isToolConflict(): boolean {
    return false;
  }

  resolveTools(toolDefinitions: any[]): any[] {
    const builtIn = this.builtInTools();
    if (
      builtIn.length > 0 &&
      toolDefinitions.length > 0 &&
      this.isToolConflict()
    ) {
      return [...builtIn];
    }
    return [...builtIn, ...toolDefinitions];
  }

  parseWebSearchAction(
    chunk: AIMessageChunk,
  ): { type: string; query: string }[] {
    return [];
  }

  parseReasoningContent(
    chunk: AIMessageChunk,
  ): { status: string; content: string } | null {
    return null;
  }

  parseResponseMetadata(output: LLMResult): any {
    return [null, null];
  }

  parseResponseError(err) {
    return err?.message ?? 'Unexpected LLM service error';
  }

  prepareStoredAssistantAdditionalKwargs(
    additionalKwargs?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    return additionalKwargs;
  }

  reshapeAIMessage(_options: {
    aiMessage: AIMessage;
    values: AIMessageInput;
  }) {}

  protected getResolvedBaseURL(): string {
    const baseURL = getServiceBaseURL(this.serviceOptions) ?? this.baseURL;
    if (!baseURL) {
      throw new Error('baseURL is required');
    }
    return normalizeBaseURL(baseURL);
  }

  protected buildRequestURL(pathname: string): string {
    const url = new URL(
      pathname.replace(/^\/+/, ''),
      `${this.getResolvedBaseURL()}/`,
    ).toString();
    checkUrlAgainstWhitelist(url);
    return url;
  }
}

export interface EmbeddingProviderOptions {
  serviceOptions?: Record<string, any>;
  modelOptions?: Record<string, any>;
}

export abstract class EmbeddingProvider {
  protected serviceOptions?: Record<string, any>;
  protected modelOptions?: Record<string, any>;
  constructor(protected opts: EmbeddingProviderOptions) {
    const { serviceOptions, modelOptions } = this.opts;
    this.serviceOptions = resolveServiceOptions(serviceOptions);
    this.modelOptions = modelOptions;
  }
  abstract createEmbedding(): EmbeddingsInterface;
  protected abstract getDefaultUrl(): string;

  protected get apiKey() {
    const { apiKey } = this.serviceOptions ?? {};
    if (!apiKey) {
      throw new Error('apiKey is required');
    }
    return apiKey;
  }

  protected get baseURL() {
    const baseURL =
      getServiceBaseURL(this.serviceOptions) ?? this.getDefaultUrl();
    if (!baseURL) {
      throw new Error('baseURL is required');
    }
    return normalizeBaseURL(baseURL);
  }

  protected get model() {
    const { model } = this.modelOptions ?? {};
    if (!model) {
      throw new Error('Embedding model is required');
    }
    return model;
  }
}
