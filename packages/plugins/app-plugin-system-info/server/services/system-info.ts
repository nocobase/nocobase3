import type { SystemInfo, SystemInfoService } from '../tokens.js';
import packageMetadata from '../../package.json' with { type: 'json' };

export class DefaultSystemInfoService implements SystemInfoService {
  public getInfo(): SystemInfo {
    return {
      packageName: '@nocobase/app-plugin-system-info',
      version: packageMetadata.version,
      nodeVersion: process.version,
      serverTime: new Date().toISOString(),
    };
  }
}
