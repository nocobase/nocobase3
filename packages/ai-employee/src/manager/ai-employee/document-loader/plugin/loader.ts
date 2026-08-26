/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { FileManager } from '../../../file/index.js';
import { Document } from '@langchain/core/documents';
import { SUPPORTED_DOCUMENT_EXTNAMES } from './constants.js';
import { ParseableFile } from './types.js';
import { resolveExtname } from './utils.js';
import { loadByWorker } from '../index.js';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export class DocumentLoader {
  constructor(private readonly fileManager: FileManager) {}

  async load(file: ParseableFile, options?: any): Promise<Document[]> {
    const extname = resolveExtname(file);
    if (!SUPPORTED_DOCUMENT_EXTNAMES.includes(extname)) {
      return [];
    }

    const { stream, contentType } = await this.fileManager.getFileStream(
      file as any,
      options,
    );
    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'nocobase-document-loader-'),
    );
    const tempFilePath = path.join(tempDir, `source${extname}`);

    try {
      await pipeline(stream, createWriteStream(tempFilePath));
      return await loadByWorker(extname, {
        filePath: tempFilePath,
        mimeType: contentType ?? file.mimetype,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
