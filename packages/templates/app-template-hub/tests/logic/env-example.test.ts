import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { RUNTIME_ENVIRONMENT_VARIABLES } from '@nocobase/app-server/config';

import defaultConfigs from '../../server/config/index.ts';

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
    // The same list `pnpm nocobase config env` prints.
    const read = new Set([
      ...sectionVariables,
      ...RUNTIME_ENVIRONMENT_VARIABLES.map((variable) => variable.name),
    ]);

    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((variable) => !read.has(variable))).toEqual([]);
  });
});
