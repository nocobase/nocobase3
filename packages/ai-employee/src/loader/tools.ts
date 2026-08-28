/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { importModule } from '../utils/import-module.js';
import type { ToolsOptions } from '../manager/tools/types.js';
import {
  DirectoryScanner,
  DirectoryScannerOptions,
  FileDescriptor,
} from './scanner.js';
import { readFile } from 'fs/promises';
import _ from 'lodash';
import { existsSync } from 'fs';
import { AIManager } from '../manager/index.js';
import { LoadAndRegister } from './types.js';
import type { Logger } from '@nocobase/logging';

export type ToolsLoaderOptions = {
  /** Allow a later resource layer to replace an already-registered tool. */
  overrideExisting?: boolean;
  scan: DirectoryScannerOptions;
  logger?: Logger;
};
export class ToolsLoader extends LoadAndRegister<ToolsLoaderOptions> {
  protected readonly scanner: DirectoryScanner;

  protected files: FileDescriptor[] = [];
  protected toolsDescriptors: ToolsDescriptor[] = [];
  protected logger: Logger;

  constructor(
    protected readonly ai: AIManager,
    protected readonly options: ToolsLoaderOptions,
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
    const grouped = new Map<string, FileDescriptor[]>();
    for (const fd of this.files) {
      const key =
        fd.basename === 'index.ts' ||
        fd.basename === 'index.js' ||
        fd.basename === 'description.md'
          ? fd.directory
          : fd.name;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(fd);
    }

    this.toolsDescriptors = (
      await Promise.all(
        Array.from(grouped.entries()).map(async ([name, fds]) => {
          const tsFile = fds.find(
            (fd) => fd.extname === '.ts' || fd.extname === '.js',
          );
          const descFile = fds.find((fd) => fd.basename === 'description.md');
          const entry: ToolsDescriptor = { name, tsFile, descFile };
          if (!tsFile || !existsSync(tsFile.path)) {
            this.logger?.error(
              `tools [${name}] ignored: can not find .ts file`,
            );
            return null;
          }
          try {
            const module = await importModule(tsFile.path);
            const candidate = typeof module === 'function' ? module() : module;
            entry.toolsOptions = isToolsOptions(candidate)
              ? candidate
              : undefined;
          } catch (e) {
            this.logger?.error(
              { error: e },
              `tools [${name}] load fail: error occur when import ${tsFile.path}`,
            );
            return null;
          }
          if (descFile && existsSync(descFile.path)) {
            try {
              entry.description = await readFile(descFile.path, 'utf-8');
            } catch (e) {
              this.logger?.error(
                { error: e },
                `tools [${name}] load fail: error occur when reading description.md at ${descFile.path}`,
              );
              return null;
            }
          }
          return entry;
        }),
      )
    ).filter((t) => t != null);
  }

  protected async register(): Promise<void> {
    if (!this.toolsDescriptors.length) {
      return;
    }
    const { toolsManager } = this.ai;
    for (const descriptor of this.toolsDescriptors) {
      if (!descriptor.toolsOptions) {
        this.logger?.warn(
          `tools [${descriptor.name}] register ignored: ToolsOptions not export as default at ${descriptor.tsFile.path}`,
        );
        continue;
      }
      const { name, toolsOptions, description } = descriptor;
      if (
        (await toolsManager.isToolsExisted(name)) &&
        !this.options.overrideExisting
      ) {
        this.logger?.warn(
          `tools [${descriptor.name}] register ignored: duplicate register for tools`,
        );
        continue;
      }
      if (toolsOptions.definition) {
        toolsOptions.definition.name = name;
        if (!_.isEmpty(description)) {
          toolsOptions.definition.description = description;
        }
      }
      try {
        await toolsManager.registerTools(toolsOptions);
        this.logger?.info(`tools [${toolsOptions.definition.name}] registered`);
      } catch (e) {
        this.logger?.error(
          { error: e },
          `tools [${descriptor.name}] register ignored: error occur when invoke registerTools`,
        );
        continue;
      }
    }
  }
}

function isToolsOptions(value: unknown): value is ToolsOptions {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    Boolean((value as ToolsOptions).definition?.name)
  );
}

export type ToolsDescriptor = {
  name: string;
  tsFile?: FileDescriptor;
  descFile?: FileDescriptor;
  toolsOptions?: ToolsOptions;
  description?: string;
};
