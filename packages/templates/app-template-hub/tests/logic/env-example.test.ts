import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import defaultConfigs from '../../server/config/index.ts';
import { environmentMappings } from '../../server/environment.ts';

/**
 * Variables read outside any mapping. `APP_BASE_PATH` is read by the standalone runtime scope itself
 * (`createStandaloneScope` in `@nocobase/app-server/node`), which derives the application name from it.
 */
const READ_BY_RUNTIME = ['APP_BASE_PATH'];

/**
 * `.env.example` is what a generated Hub's `.env` is copied from, so every variable it names — set or commented out —
 * has to be one something reads. `AUTH_DISABLE_SIGN_UP` and `APP_NAME` both sat in it for a while doing nothing.
 */
describe('.env.example', () => {
  it('names only variables the application reads', () => {
    const example = readFileSync(
      path.resolve(import.meta.dirname, '../../.env.example'),
      'utf8',
    );
    const named = [...example.matchAll(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/gmu)].map(
      (match) => match[1],
    );
    const sectionVariables = [
      ...(defaultConfigs.sections?.values() ?? []),
    ].flatMap((rules) => Object.keys(rules.env ?? {}));
    const read = new Set([
      ...Object.keys(environmentMappings),
      ...sectionVariables,
      ...READ_BY_RUNTIME,
    ]);

    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((variable) => !read.has(variable))).toEqual([]);
  });
});
