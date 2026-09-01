/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppDefinition, AppFactory } from '../app-types.ts';

type AppModule = Record<string, unknown>;

export class AppModuleLoader {
  async resolveFactory(definition: AppDefinition): Promise<AppFactory> {
    if (!definition.server) {
      throw new Error(`App ${definition.id} has no server entrypoint`);
    }

    const absoluteEntrypoint = path.resolve(
      definition.server.rootDir,
      definition.server.entrypoint,
    );
    this.assertInside(definition.server.rootDir, absoluteEntrypoint);
    await stat(absoluteEntrypoint);

    const moduleUrl = pathToFileURL(absoluteEntrypoint);
    const fingerprint =
      definition.release?.fingerprint ?? definition.code?.fingerprint;
    if (fingerprint) {
      moduleUrl.searchParams.set('deployment', fingerprint);
    }

    const module = (await import(moduleUrl.href)) as AppModule;
    const factory =
      module.createServer ??
      module.createApp ??
      module.default ??
      module.createExampleApp ??
      module.createApi;
    if (typeof factory === 'function') {
      return factory as AppFactory;
    }

    throw new Error(
      `App ${definition.id} must export createServer(scope), createApp(scope), default(scope), createExampleApp(scope), or createApi(scope)`,
    );
  }

  private assertInside(rootDir: string, targetPath: string): void {
    const relative = path.relative(rootDir, targetPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`App server path must stay inside ${rootDir}`);
    }
  }
}
