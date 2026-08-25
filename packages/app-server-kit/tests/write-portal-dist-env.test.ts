import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { writePortalDistEnv } from '../scripts/write-portal-dist-env.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('portal dist environment extraction', () => {
  it('writes only allowlisted server config and removes stale output', () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nocobase-portal-dist-env-'),
    );
    tempDirs.push(rootDir);
    fs.writeFileSync(
      path.join(rootDir, '.env'),
      [
        'APP_NAME=crm',
        'APP_HOST_CONTROL_TOKEN=must-not-be-packaged',
        'UNRELATED_SECRET=also-excluded',
      ].join('\n'),
    );

    writePortalDistEnv({ rootDir, allowedKeys: new Set(['APP_NAME']) });

    const outputPath = path.join(rootDir, 'dist/.env');
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('APP_NAME=crm\n');

    fs.rmSync(path.join(rootDir, '.env'));
    writePortalDistEnv({ rootDir, allowedKeys: new Set(['APP_NAME']) });

    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
