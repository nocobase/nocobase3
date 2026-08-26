import type { Command } from '@oclif/core';
import { describe, expect, it } from 'vitest';
import { reportStub } from '../src/lib/stub.ts';

function createCommand(id: string): { command: Command; lines: string[] } {
  const lines: string[] = [];
  const command = {
    id,
    log: (message?: string) => {
      lines.push(message ?? '');
    },
  } as unknown as Command;

  return { command, lines };
}

describe('reportStub', () => {
  it('renders the command id with spaces instead of colons', () => {
    const { command, lines } = createCommand('app:create');
    reportStub(command);

    expect(lines).toEqual(['[nb3] app create (not implemented)']);
  });

  it('prints args before flags and prefixes flags with dashes', () => {
    const { command, lines } = createCommand('app:pull');
    reportStub(command, {
      args: { name: 'crm' },
      flags: { hub: 'http://localhost:3000' },
    });

    expect(lines).toEqual([
      '[nb3] app pull (not implemented)',
      '  name   crm',
      '  --hub  http://localhost:3000',
    ]);
  });

  it('omits values that were never supplied', () => {
    const { command, lines } = createCommand('hub:logs');
    reportStub(command, {
      flags: { follow: false, tail: 100, dir: undefined },
    });

    expect(lines).toEqual([
      '[nb3] hub logs (not implemented)',
      '  --tail  100',
    ]);
  });

  it('joins array values', () => {
    const { command, lines } = createCommand('app:pull');
    reportStub(command, { flags: { tags: ['a', 'b'] } });

    expect(lines).toEqual([
      '[nb3] app pull (not implemented)',
      '  --tags  a, b',
    ]);
  });
});
