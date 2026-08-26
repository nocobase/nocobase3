/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import type { Context } from '../../../../runtime/context.js';
import { DocumentLoader } from './loader.js';
import { SUPPORTED_DOCUMENT_EXTNAMES } from './constants.js';
import { CachedDocumentLoader } from './cached.js';
import { resolveExtname } from './utils.js';

export class DocumentLoaders {
  readonly raw: DocumentLoader;
  readonly cached: CachedDocumentLoader;

  constructor(private readonly ctx: Pick<Context, 'caching' | 'fileManager'>) {
    this.raw = new DocumentLoader(this.ctx.fileManager);
    this.cached = new CachedDocumentLoader(this.ctx, {
      loader: this.raw,
      parserVersion: 'v1',
      parsedMimetype: 'text/plain',
      parsedFileExtname: 'txt',
      supports: (file) =>
        SUPPORTED_DOCUMENT_EXTNAMES.includes(resolveExtname(file)),
    });
  }
}

export * from './constants.js';
export * from './types.js';
export * from './loader.js';
export * from './cached.js';
export * from './utils.js';
