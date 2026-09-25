import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../package.json' with { type: 'json' };

type Conditions = { readonly types: string; readonly import: string };
type ExportMap = Readonly<Record<string, Conditions | string>>;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceExports = packageMetadata.exports as ExportMap;
const publishedExports = packageMetadata.publishConfig.exports as ExportMap;

function entries(map: ExportMap): [string, Conditions][] {
  return Object.entries(map).filter(
    (entry): entry is [string, Conditions] => typeof entry[1] !== 'string',
  );
}

describe('package exports', () => {
  // A module loaded from two files is two modules, each with its own service
  // tokens, and the container finds a token by identity. So every entry an
  // App can import has to resolve to the same kind of file as the one it
  // registers the plugin from: source in the workspace, and the built output
  // once published. A workspace entry pointing at `dist` also serves whatever
  // was last built rather than the source beside it.
  it('resolves every workspace entry to source that exists', () => {
    for (const [subpath, target] of entries(workspaceExports)) {
      for (const file of [target.types, target.import]) {
        expect(file, subpath).not.toMatch(/^\.\/dist\//);
        expect(file, subpath).toMatch(/\.tsx?$/);
        expect(existsSync(join(packageRoot, file)), `${subpath} ${file}`).toBe(
          true,
        );
      }
    }
  });

  it('publishes the same entries, each built from its workspace source', () => {
    expect(Object.keys(publishedExports).sort()).toEqual(
      Object.keys(workspaceExports).sort(),
    );
    for (const [subpath, source] of entries(workspaceExports)) {
      const built = `./dist/${source.import.slice(2).replace(/\.tsx?$/, '')}`;
      expect(publishedExports[subpath], subpath).toEqual({
        types: `${built}.d.ts`,
        import: `${built}.js`,
      });
    }
  });
});
