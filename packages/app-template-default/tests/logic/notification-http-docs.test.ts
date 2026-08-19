// @vitest-environment node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  generateNotificationHttpMarkdown,
  generateNotificationOpenApi,
} from '../../registry/notification/scripts/generate-http-docs.ts';

describe('notification generated HTTP documentation', () => {
  it('matches the runtime route contracts', async () => {
    const docsDirectory = path.resolve('registry/notification/docs/generated');
    const [openApi, markdown] = await Promise.all([
      readFile(path.join(docsDirectory, 'openapi.json'), 'utf8'),
      readFile(path.join(docsDirectory, 'http-api.md'), 'utf8'),
    ]);
    expect(openApi).toBe(`${JSON.stringify(generateNotificationOpenApi(), null, 2)}\n`);
    expect(markdown).toBe(generateNotificationHttpMarkdown());
  });
});
