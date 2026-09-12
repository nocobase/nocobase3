import { createHash } from 'node:crypto';

import type { TSchema } from '@sinclair/typebox';

import type { AppConfigContribution } from './app-config-types.js';

export const APP_CONFIG_SCHEMA_FORMAT_VERSION = 1 as const;

export interface AppConfigSchemaEntry {
  readonly namespace: string;
  readonly schema: TSchema;
}

export interface AppConfigSchemaVariantEntry {
  readonly target: string;
  readonly discriminator: string;
  readonly value: string;
  readonly schema: TSchema;
}

export interface AppConfigSchemaDocument {
  readonly formatVersion: 1;
  readonly configs: readonly AppConfigSchemaEntry[];
  readonly variants: readonly AppConfigSchemaVariantEntry[];
}

export interface AppConfigSchemaArtifact {
  readonly document: AppConfigSchemaDocument;
  readonly json: string;
  readonly digest: string;
}

export function createAppConfigSchemaDocument(
  contributions: readonly AppConfigContribution[],
): AppConfigSchemaDocument {
  const configs: AppConfigSchemaEntry[] = [];
  const variants: AppConfigSchemaVariantEntry[] = [];

  for (const contribution of contributions) {
    if (contribution.kind === 'config') {
      configs.push({
        namespace: contribution.namespace,
        schema: toJsonSchema(contribution.schema),
      });
      continue;
    }
    variants.push({
      target: contribution.target,
      discriminator: contribution.discriminator,
      value: contribution.value,
      schema: toJsonSchema(contribution.schema),
    });
  }

  return Object.freeze({
    formatVersion: APP_CONFIG_SCHEMA_FORMAT_VERSION,
    configs: Object.freeze(configs),
    variants: Object.freeze(variants),
  });
}

function toJsonSchema(schema: TSchema): TSchema {
  return JSON.parse(JSON.stringify(schema)) as TSchema;
}

export function createAppConfigSchemaArtifact(
  contributions: readonly AppConfigContribution[],
): AppConfigSchemaArtifact {
  const document = createAppConfigSchemaDocument(contributions);
  const json = `${JSON.stringify(document, null, 2)}\n`;
  return {
    document,
    json,
    digest: createHash('sha256').update(json).digest('hex'),
  };
}
