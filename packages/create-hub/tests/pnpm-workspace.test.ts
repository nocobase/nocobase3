import { describe, expect, it } from 'vitest';
import { buildWorkspaceYaml } from '../src/lib/pnpm-workspace.ts';

describe('buildWorkspaceYaml', () => {
  it('allows the Hub SQLite driver to compile under pnpm 11', () => {
    const yaml = buildWorkspaceYaml();

    expect(yaml).toContain('allowBuilds:');
    expect(yaml).toContain('better-sqlite3: true');
  });

  it('does not include frontend build tools absent from the runtime package', () => {
    const yaml = buildWorkspaceYaml();

    expect(yaml).not.toContain('esbuild');
    expect(yaml).not.toContain('@nocobase/app-portal-sdk');
  });
});
