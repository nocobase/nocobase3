/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { importModule } from '../utils/import-module.js';
import { existsSync } from 'fs';
import type { Logger } from '@nocobase/logging';
import { AIManager } from '../manager/index.js';
import type { MCPOptions } from '../manager/mcp-server/types.js';
import { LoadAndRegister } from './types.js';
import {
  DirectoryScanner,
  DirectoryScannerOptions,
  FileDescriptor,
} from './scanner.js';
import { isNonEmptyObject } from './utils.js';

export type MCPLoaderOptions = {
  scan: DirectoryScannerOptions;
  logger?: Logger;
};

export class MCPLoader extends LoadAndRegister<MCPLoaderOptions> {
  protected readonly scanner: DirectoryScanner;

  protected files: FileDescriptor[] = [];
  protected mcpDescriptors: MCPDescriptor[] = [];
  protected logger?: Logger;

  constructor(
    protected readonly ai: AIManager,
    protected readonly options: MCPLoaderOptions,
  ) {
    super(ai, options);
    this.logger = options.logger;
    this.scanner = new DirectoryScanner(this.options.scan);
  }

  protected async scan(): Promise<void> {
    this.files = await this.scanner.scan();
  }

  protected async import(): Promise<void> {
    if (!this.files.length) {
      return;
    }

    const descriptors = await Promise.all(
      this.files.map(async (file) => {
        const name = file.name;
        if (!existsSync(file.path)) {
          this.logger?.error(
            `mcp [${name}] ignored: can not find definition file at ${file.path}`,
          );
          return null;
        }

        try {
          const imported = await importModule(file.path);
          const mod = imported?.default ?? imported;
          const options = typeof mod === 'function' ? mod() : mod;

          if (!isNonEmptyObject(options)) {
            this.logger?.warn(
              `mcp [${name}] register ignored: invalid definition at ${file.path}`,
            );
            return null;
          }

          return {
            name,
            file,
            options: options as MCPOptions,
          } satisfies MCPDescriptor;
        } catch (e) {
          this.logger?.error(
            { error: e },
            `mcp [${name}] load fail: error occur when import ${file.path}`,
          );
          return null;
        }
      }),
    );

    this.mcpDescriptors = descriptors.filter((item): item is MCPDescriptor =>
      Boolean(item),
    );
  }

  protected async register(): Promise<void> {
    if (!this.mcpDescriptors.length) {
      return;
    }

    const { mcpServerManager } = this.ai;
    for (const descriptor of this.mcpDescriptors) {
      try {
        await mcpServerManager.registerMCP({
          [descriptor.name]: descriptor.options,
        });
      } catch (e) {
        this.logger?.error(
          { error: e },
          `mcp [${descriptor.name}] register ignored: error occur when invoke registerMCP`,
        );
      }
    }
  }
}

export type MCPDescriptor = {
  name: string;
  file: FileDescriptor;
  options: MCPOptions;
};
