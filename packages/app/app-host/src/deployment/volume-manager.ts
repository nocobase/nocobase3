/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export class AppVolumeManager {
  readonly volumesDir: string;

  constructor(volumesDir: string) {
    this.volumesDir = path.resolve(volumesDir);
  }

  configPath(appId: string): string {
    this.assertAppId(appId);
    return path.join(this.volumesDir, appId, 'config');
  }

  storageDir(appId: string): string {
    this.assertAppId(appId);
    return path.join(this.volumesDir, appId, 'storage');
  }

  async prepareStorageDir(appId: string): Promise<string> {
    const storageDir = this.storageDir(appId);
    await mkdir(storageDir, { recursive: true, mode: 0o700 });
    return storageDir;
  }

  private assertAppId(appId: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(appId)) {
      throw new Error(`Invalid app ID "${appId}"`);
    }
  }
}
