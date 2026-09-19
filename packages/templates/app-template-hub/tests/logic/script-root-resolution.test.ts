// @vitest-environment node

import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(import.meta.dirname, '..', '..');

/**
 * A `path.resolve()` call that starts from the current file's own location, in either spelling used here:
 * `import.meta.dirname`, or `path.dirname(fileURLToPath(import.meta.url))`. The `s` flag matters — these calls are
 * usually written across several lines.
 */
const RESOLVE_FROM_OWN_LOCATION =
  /path\.resolve\(\s*(?:import\.meta\.dirname|path\.dirname\(\s*fileURLToPath\(\s*import\.meta\.url\s*\)\s*,?\s*\))\s*((?:,\s*'[^']*'\s*)*),?\s*\)/gs;

interface RootResolution {
  readonly file: string;
  readonly upCount: number;
  readonly directoryDepth: number;
}

function findRootResolutions(): RootResolution[] {
  const found: RootResolution[] = [];

  for (const file of globSync('{scripts,cli}/**/*.{mjs,ts}', {
    cwd: appRoot,
  }).sort()) {
    const source = readFileSync(path.join(appRoot, file), 'utf8');
    for (const [, argumentList] of source.matchAll(RESOLVE_FROM_OWN_LOCATION)) {
      const segments = [...argumentList.matchAll(/'([^']*)'/g)].map(
        ([, segment]) => segment,
      );
      found.push({
        file,
        // A trailing filename such as 'package.json' is not part of walking up.
        upCount: segments.filter((segment) => segment === '..').length,
        directoryDepth: path.dirname(file).split('/').length,
      });
    }
  }
  return found;
}

/**
 * A file that finds the application root by walking up from its own location has to walk up exactly as many levels as
 * it sits deep. Nothing enforces that when the file moves: the path still resolves, only to the wrong directory, and
 * the failure surfaces somewhere else entirely — a tsconfig reported missing, or a `dist` written inside `scripts/`.
 *
 * Moving a file one directory deeper has broken this repeatedly, most recently when `scripts/dev.mjs` became
 * `scripts/dev/index.mjs` and `pnpm dev` stopped starting.
 */
describe('resolving the application root from a file location', () => {
  const resolutions = findRootResolutions();

  it('finds every file that does this', () => {
    // Guards the pattern itself: a regex that silently stops matching would turn this suite into a no-op. The count is
    // a floor rather than an exact number so that adding such a file does not fail the suite for the wrong reason.
    expect(resolutions.length).toBeGreaterThanOrEqual(9);
    expect(resolutions.map(({ file }) => file)).toContain(
      'scripts/dev/index.mjs',
    );
  });

  it.each(resolutions)(
    '$file walks up $upCount level(s) from depth $directoryDepth',
    ({ upCount, directoryDepth }) => {
      expect(upCount).toBe(directoryDepth);
    },
  );
});
