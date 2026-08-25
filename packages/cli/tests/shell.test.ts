import { describe, expect, it } from 'vitest';

import { formatShellCommand } from '../src/lib/shell.ts';

describe('shell command formatting', () => {
  it('quotes dynamic arguments so the suggested command can be copied safely', () => {
    expect(
      formatShellCommand([
        'nb3',
        'app',
        'publish',
        '--dir',
        '/tmp/Sales App',
        '--label',
        "owner's app",
      ]),
    ).toBe(`nb3 app publish --dir '/tmp/Sales App' --label 'owner'"'"'s app'`);
  });

  it('quotes empty arguments and leaves ordinary CLI tokens readable', () => {
    expect(
      formatShellCommand([
        'nb3',
        'app',
        'pull',
        '',
        '--hub',
        'https://hub.test/hub',
      ]),
    ).toBe("nb3 app pull '' --hub https://hub.test/hub");
  });
});
