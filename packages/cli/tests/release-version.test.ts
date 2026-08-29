import { describe, expect, it } from 'vitest';

import { resolveReleaseVersion } from '../src/lib/release-version.ts';

describe('resolveReleaseVersion', () => {
  it('accepts an explicit semantic version', () => {
    expect(resolveReleaseVersion({ version: '1.4.0', releases: [] })).toBe(
      '1.4.0',
    );
  });

  it('bumps the highest semantic version rather than trusting list order', () => {
    expect(
      resolveReleaseVersion({
        bump: 'minor',
        releases: [{ version: '1.9.0' }, { version: '2.1.3' }],
      }),
    ).toBe('2.2.0');
  });

  it('starts at 0.1.0 when no releases exist', () => {
    expect(resolveReleaseVersion({ bump: 'patch', releases: [] })).toBe(
      '0.1.0',
    );
  });

  it('rejects conflicting or missing version options', () => {
    expect(() =>
      resolveReleaseVersion({ version: '1.0.0', bump: 'patch', releases: [] }),
    ).toThrow(/cannot be used together/);
    expect(() => resolveReleaseVersion({ releases: [] })).toThrow(
      /Specify --version .* or --bump/,
    );
  });
});
