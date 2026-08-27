import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildGeneratedAppFiles } from '../src/create.ts';
import { defaultDatabaseConfig } from '../src/lib/database.ts';
import {
  APP_STATE_DIRECTORY,
  buildAppProjectConfig,
} from '../src/lib/app-project.ts';

describe('buildAppProjectConfig', () => {
  it('writes the identity and template origin used by nb3 App commands', () => {
    const content = buildAppProjectConfig({
      name: 'crm',
      template: '@nocobase/app-template-default',
      templateVersion: '0.0.1-beta.3',
    });

    expect(APP_STATE_DIRECTORY).toBe('.nb3');
    expect(JSON.parse(content)).toEqual({
      name: 'crm',
      template: '@nocobase/app-template-default',
      templateVersion: '0.0.1-beta.3',
    });
    expect(content.endsWith('\n')).toBe(true);
  });
});

describe('buildGeneratedAppFiles', () => {
  it('connects generated source to nb3 project discovery', () => {
    const files = buildGeneratedAppFiles({
      database: defaultDatabaseConfig('sqlite'),
      envTemplate: 'APP_BASE_PATH=/main\n',
      project: {
        name: 'crm',
        template: '@nocobase/app-template-default',
        templateVersion: '0.0.1-beta.3',
      },
    });

    expect(files['.env.local']).toContain('DB_DIALECT=sqlite');
    expect(
      JSON.parse(files[path.join(APP_STATE_DIRECTORY, 'config.json')] ?? ''),
    ).toMatchObject({
      name: 'crm',
      template: '@nocobase/app-template-default',
    });
  });
});
