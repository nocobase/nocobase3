/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Config, type ConfigMap } from '@nocobase/config';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import { objectProvider } from '@nocobase/config/providers/object';

import type { DeploymentConfigRevision } from './types.ts';

export class ConfigMaterializer {
  private readonly revisions = new Map<
    string,
    { revision: string; content: string }
  >();

  constructor(readonly volumesDir: string) {}

  async prepareStorageDir(appId: string): Promise<string> {
    assertSafeSegment(appId, 'app ID');
    const storageDir = path.join(this.volumesDir, appId, 'storage');
    await mkdir(storageDir, { recursive: true, mode: 0o700 });
    return storageDir;
  }

  async materialize(
    appId: string,
    config: DeploymentConfigRevision,
  ): Promise<string> {
    assertSafeSegment(appId, 'app ID');
    assertSafeSegment(config.revision, 'config revision');
    const volumeDir = path.join(this.volumesDir, appId);
    const targetPath = path.join(volumeDir, 'config.yml');
    const temporaryPath = path.join(
      volumeDir,
      `.config.${process.pid}.${randomUUID()}.tmp`,
    );
    await mkdir(volumeDir, { recursive: true, mode: 0o700 });

    const content = await serializeConfig(config.value);
    const current = this.revisions.get(appId);
    if (current?.revision === config.revision) {
      if (current.content !== content) {
        throw new Error(
          `Config revision "${config.revision}" for app "${appId}" is immutable`,
        );
      }
      return targetPath;
    }

    await writeFile(temporaryPath, content, { mode: 0o600, flag: 'wx' });
    await rename(temporaryPath, targetPath);
    this.revisions.set(appId, { revision: config.revision, content });
    return targetPath;
  }
}

async function serializeConfig(value: unknown): Promise<string> {
  if (!isRecord(value)) {
    throw new Error('Config revision value must be an object');
  }
  const config = new Config();
  await config.load(objectProvider(toConfigMap(value)));
  return new TextDecoder().decode(config.serialize(yamlParser()));
}

function toConfigMap(value: Record<string, unknown>): ConfigMap {
  return JSON.parse(JSON.stringify(value)) as ConfigMap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSafeSegment(value: string, label: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Invalid ${label} "${value}"`);
  }
}
