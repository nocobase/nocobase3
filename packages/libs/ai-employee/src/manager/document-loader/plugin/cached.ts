/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document } from '@langchain/core/documents';
import type { Cache, Caching } from '@nocobase/caching';
import type {
  DocumentLoaderLike,
  ParseableFile,
  ParsedDocumentResult,
} from './types.js';
import { resolveExtname } from './utils.js';

export type CachedDocumentLoaderOptions = {
  loader: DocumentLoaderLike;
  parserVersion: string;
  parsedMimetype: string;
  parsedFileExtname: string;
  supports: (file: ParseableFile) => boolean;
};

export function getDocumentCacheKey(sourceFile: ParseableFile): string | null {
  if (!sourceFile) {
    return null;
  }
  if (sourceFile.source?.documentCache === false) {
    return null;
  }
  if (sourceFile.id == null || !sourceFile.disk || !sourceFile.path) {
    return null;
  }
  return `${sourceFile.disk}:${String(sourceFile.id)}:${sourceFile.path}`;
}

export class CachedDocumentLoader {
  protected _cache: Cache | null = null;
  constructor(
    private readonly caching: Caching | undefined,
    private readonly options: CachedDocumentLoaderOptions,
  ) {}

  async load(
    file: ParseableFile,
    options?: any,
  ): Promise<ParsedDocumentResult> {
    const sourceFile = this.toPlainObject(file);

    if (!this.options.supports(sourceFile)) {
      return {
        supported: false,
        fromCache: false,
        text: '',
        documents: [],
      };
    }

    if (sourceFile.size === 0) {
      return {
        supported: true,
        fromCache: false,
        text: '',
        documents: [],
      };
    }

    const cached = await this.loadFromCache(sourceFile);
    if (cached) {
      return cached;
    }

    const documents = await this.options.loader.load(sourceFile, options);
    const text = this.documentsToText(documents);
    await this.persistParsedText(sourceFile, text);

    return {
      supported: true,
      fromCache: false,
      text,
      documents,
    };
  }

  private async loadFromCache(
    sourceFile: ParseableFile,
  ): Promise<ParsedDocumentResult | null> {
    if (!this.caching) {
      return null;
    }
    const cacheKey = this.getCacheKey(sourceFile);
    if (!cacheKey) {
      return null;
    }
    const cache = await this.getCache();
    const filePath = await cache.get<string>(cacheKey);

    if (!filePath) {
      return null;
    }

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        return null;
      }
    } catch {
      return null;
    }

    const text = await fs.readFile(filePath, 'utf-8');
    const extname = resolveExtname(sourceFile);
    const documents = this.toDocumentsFromText(text, sourceFile, extname);

    return {
      supported: true,
      fromCache: true,
      text,
      documents,
    };
  }

  private async persistParsedText(
    sourceFile: ParseableFile,
    text: string,
  ): Promise<null | void> {
    if (!this.caching) {
      return null;
    }
    const cacheKey = this.getCacheKey(sourceFile);
    if (!cacheKey) {
      return null;
    }
    const tempFilePath = path.join(
      os.tmpdir(),
      `${cacheKey}.${Date.now()}.parsed.${this.options.parsedFileExtname}`,
    );
    await fs.writeFile(tempFilePath, text, 'utf-8');

    const cache = await this.getCache();
    await cache.set(cacheKey, tempFilePath, 30 * 60 * 1000);
  }

  private documentsToText(documents: Document[]) {
    return documents.map((doc) => doc.pageContent).join('\n\n');
  }

  private toDocumentsFromText(
    text: string,
    sourceFile: ParseableFile,
    extname: string,
  ) {
    if (!text) {
      return [];
    }

    return [
      new Document({
        pageContent: text,
        metadata: {
          source: sourceFile.filename,
          extname,
        },
      }),
    ];
  }

  private toPlainObject<T extends ParseableFile = ParseableFile>(
    file: T | any,
  ): T {
    return file as T;
  }

  private async getCache(): Promise<Cache> {
    if (!this.caching) {
      throw new Error('Document caching is not configured');
    }
    this._cache ??= this.caching.getCache({
      namespace: 'ai-employee:document-loader:parsed',
    });
    return this._cache;
  }

  private getCacheKey(sourceFile: ParseableFile) {
    return getDocumentCacheKey(sourceFile);
  }
}
