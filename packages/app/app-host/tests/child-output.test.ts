import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { readJournal } from '@nocobase/logging';
import { captureChildOutput } from '../src/child-output.js';

it('captures partial UTF-8 lines and bounds unterminated child output', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'host-child-output-'));
  try {
    const child = spawn(
      process.execPath,
      [
        '-e',
        `process.stdout.write('hello\\n' + 'x'.repeat(20000)); process.stderr.write('错误');`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    captureChildOutput(child, directory);
    await once(child, 'close');
    await vi.waitFor(async () => {
      const page = await readJournal(directory, { fromStart: true });
      expect(page.entries).toHaveLength(4);
      expect(
        page.entries.some(
          (entry) => entry.msg === '错误' && entry.source === 'stderr',
        ),
      ).toBe(true);
      expect(
        page.entries.every((entry) => String(entry.msg).length <= 16384),
      ).toBe(true);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('strips terminal escapes before a captured line reaches the journal', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'host-child-color-'));
  try {
    const child = spawn(
      process.execPath,
      [
        '-e',
        `console.log(String.fromCharCode(27) + '[32mINFO' + String.fromCharCode(27) + '[39m host ready')`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    captureChildOutput(child, directory);
    await once(child, 'close');
    await vi.waitFor(async () => {
      const page = await readJournal(directory, { fromStart: true });
      expect(page.entries).toHaveLength(1);
      expect(page.entries[0]?.msg).toBe('INFO host ready');
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
