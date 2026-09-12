/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */
import type { Caching } from '@nocobase/caching';
import type { FileStorage } from '../../../file-storage/index.js';
import { DocumentLoader } from './loader.js';
import { SUPPORTED_DOCUMENT_EXTNAMES } from './constants.js';
import { CachedDocumentLoader } from './cached.js';
import { resolveExtname } from './utils.js';

export class DocumentLoaders {
  readonly raw: DocumentLoader<any, any>;
  readonly cached: CachedDocumentLoader;

  public constructor(
    private readonly ctx: {
      caching?: Caching;
      fileStorage: FileStorage<any, any>;
    },
  ) {
    this.raw = new DocumentLoader(this.ctx.fileStorage);
    this.cached = new CachedDocumentLoader(this.ctx.caching, {
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
