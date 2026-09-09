import path from 'node:path';

import { z } from 'zod';

import type {
  KnowledgeBaseManifest,
  KnowledgeBaseManifestSource,
} from './manifest.js';

const text = z.string().trim().min(1);
const location = text
  .transform(normalizeManifestLocation)
  .refine(Boolean, { message: 'location must not be empty' })
  .refine(isDiskRelativeManifestLocation, {
    message: 'location must stay within its Drive disk',
  });
const fileSchema = z
  .object({ disk: text, locations: z.array(location).min(1) })
  .strict();
const initiateSchema = z
  .object({
    disk: text,
    name: text,
    vectorDatabase: text,
    llmService: text,
    embeddingModel: text,
    description: text.optional(),
  })
  .strict();

const baseManifestSchema = z
  .object({
    key: text,
    operation: z.enum(['init', 'append', 'recover']),
    initiate: initiateSchema.optional(),
    files: z.array(fileSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.operation === 'init' && !value.initiate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['initiate'],
        message: 'initiate is required for operation init',
      });
    }
    const sources = new Set<string>();
    value.files.forEach((file, fileIndex) => {
      file.locations.forEach((item, locationIndex) => {
        const identity = `${file.disk}\0${item}`;
        if (sources.has(identity)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['files', fileIndex, 'locations', locationIndex],
            message: 'duplicate file disk/location',
          });
        }
        sources.add(identity);
      });
    });
  });

export function parseKnowledgeBaseManifest(
  value: unknown,
): KnowledgeBaseManifest {
  return baseManifestSchema.parse(value);
}

export function normalizeManifestSource(
  source: KnowledgeBaseManifestSource,
): KnowledgeBaseManifestSource {
  if (!source || typeof source !== 'object') {
    throw new Error('Manifest source must be an object.');
  }
  const disk = typeof source.disk === 'string' ? source.disk.trim() : '';
  const location =
    typeof source.location === 'string'
      ? normalizeManifestLocation(source.location)
      : '';
  if (!disk) throw new Error('Manifest source disk must not be empty.');
  if (!location) throw new Error('Manifest source location must not be empty.');
  if (!isDiskRelativeManifestLocation(location)) {
    throw new Error(
      'Manifest source location must stay within its Drive disk.',
    );
  }
  return { disk, location };
}

export function normalizeManifestLocation(value: string): string {
  const relative = value.trim().replaceAll('\\', '/').replace(/^\/+/, '');
  const normalized = path.posix.normalize(relative);
  return normalized === '.' ? '' : normalized;
}

function isDiskRelativeManifestLocation(value: string): boolean {
  return value !== '..' && !value.startsWith('../');
}
