import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../package.json' with { type: 'json' };
import plugin from '../server/index.js';

describe('@nocobase/app-plugin-scheduler', () => {
  it('declares only its selected Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-scheduler',
      locales: expect.any(Function),
      serviceProviders: expect.any(Array),
      routes: expect.any(Array),
      database: {
        migrations: './database/migrations',
      },
      queue: { jobs: ['./server/jobs'] },
    });
  });

  it('publishes App Agent guidance for declaring and dispatching schedules', () => {
    const source = readFileSync(
      new URL(
        '../skills/nocobase-app-plugin-scheduler/SKILL.md',
        import.meta.url,
      ),
      'utf8',
    );
    expect(packageMetadata.files).toContain('skills');
    expect(source).toContain('defineSchedule');
    expect(source).toContain('schedules: { definitions:');
    expect(source).toContain('jobDispatchRegistryToken');
    expect(source).toContain('occurrenceId');
    expect(source).toContain('scheduler:sync --finalize');
    expect(source).toContain('must not contain credentials');
  });
});
