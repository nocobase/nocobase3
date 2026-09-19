import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import metadata from '../package.json' with { type: 'json' };

describe('package exports', () => {
  it('resolves workspace exports from source and publishes compiled exports', () => {
    expect(Object.keys(metadata.exports)).toEqual(
      Object.keys(metadata.publishConfig.exports),
    );
    for (const [key, entry] of Object.entries(metadata.exports)) {
      expect(entry.types).toMatch(/^\.\/src\/.*\.ts$/);
      expect(entry.import).toBe(entry.types);
      expect(
        existsSync(
          fileURLToPath(new URL(`../${entry.import}`, import.meta.url)),
        ),
      ).toBe(true);
      const published =
        metadata.publishConfig.exports[key as keyof typeof metadata.exports];
      expect(published.import).toBe(
        entry.import.replace('./src/', './dist/').replace(/\.ts$/, '.js'),
      );
      expect(published.types).toBe(published.import.replace(/\.js$/, '.d.ts'));
    }
  });
});
