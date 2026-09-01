import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  coreConfigs,
  createAppConfigSchemaArtifact,
  type AppConfigContribution,
} from '@nocobase/app-server';

import plugins from '../server/plugins.js';

export interface BuildConfigSchemaResult {
  readonly outputPath: string;
  readonly digest: string;
  readonly configs: number;
  readonly variants: number;
}

export async function buildConfigSchema(
  rootDir: string = process.cwd(),
): Promise<BuildConfigSchemaResult> {
  const contributions: AppConfigContribution[] = [...coreConfigs];
  for (const plugin of plugins.plugins) {
    contributions.push(...plugin.config);
  }
  const artifact = createAppConfigSchemaArtifact(contributions);
  const outputPath = path.join(rootDir, 'dist', 'config-schema.json');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, artifact.json, { mode: 0o600 });
  return {
    outputPath,
    digest: artifact.digest,
    configs: artifact.document.configs.length,
    variants: artifact.document.variants.length,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const result = await buildConfigSchema();
  console.log(
    `[config-schema] generated ${path.relative(process.cwd(), result.outputPath)} (${result.configs} configs, ${result.variants} variants, sha256:${result.digest})`,
  );
}
