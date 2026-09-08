import type { AIKnowledgeBaseManifestConfig } from '@nocobase/app-plugin-ai-employee/server/config';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import { parse as parseYaml } from 'yaml';

import type { KnowledgeBaseRepositoryFactory } from './factories/repository-factory.js';
import type { KnowledgeBaseWarningLogger } from './internal-types.js';
import type { KnowledgeBaseManifestService } from './manifest.js';
import {
  normalizeManifestLocation,
  normalizeManifestSource,
  parseKnowledgeBaseManifest,
} from './manifest-schema.js';

export class KnowledgeBaseManifestBootstrapper {
  public constructor(
    private readonly drive: NocoBaseDriveManager,
    private readonly repositories: KnowledgeBaseRepositoryFactory,
    private readonly service: KnowledgeBaseManifestService,
    private readonly warningLogger: KnowledgeBaseWarningLogger,
  ) {}

  public async apply(
    sources: readonly AIKnowledgeBaseManifestConfig[] | undefined,
  ): Promise<void> {
    for (const source of sources ?? []) {
      for (const location of source.locations) {
        try {
          const normalized = normalizeManifestSource({
            disk: source.disk,
            location: normalizeManifestLocation(location),
          });
          const existing = await this.repositories.manifests.findOne({
            sourceDisk: normalized.disk,
            sourceLocation: normalized.location,
          });
          if (existing?.status === 'SUCCESS') continue;
          if (existing) {
            await this.service.apply([
              {
                source: normalized,
                manifest: parseKnowledgeBaseManifest(existing.manifestSnapshot),
              },
            ]);
            continue;
          }
          const bytes = await readDriveObject(
            this.drive,
            normalized.disk,
            normalized.location,
          );
          const manifest = parseKnowledgeBaseManifest(
            parseYaml(Buffer.from(bytes).toString('utf8')),
          );
          await this.service.apply([{ source: normalized, manifest }]);
        } catch (error) {
          this.warningLogger.warn(
            'Knowledge base Manifest source could not be loaded.',
            {
              sourceDisk: source.disk,
              sourceLocation: location,
              error,
            },
          );
        }
      }
    }
  }
}

async function readDriveObject(
  drive: NocoBaseDriveManager,
  disk: string,
  location: string,
): Promise<Uint8Array> {
  const stream = await drive.use(disk).getStream(location);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<unknown>) {
    chunks.push(
      typeof chunk === 'string'
        ? Buffer.from(chunk)
        : Buffer.from(chunk as Uint8Array),
    );
  }
  return Buffer.concat(chunks);
}
