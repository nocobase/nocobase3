import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const registryKey = '@nocobase:registry';

/**
 * Persists the registry used for NocoBase packages without changing where npm resolves unrelated dependencies.
 * Existing template settings are preserved, and rerunning this reconciliation produces the same file.
 */
export async function ensureScopedNocoBaseRegistry(
  directory: string,
  registry: string,
): Promise<void> {
  const target = path.join(directory, '.npmrc');
  let existing = '';
  try {
    existing = await readFile(target, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const registryLine = `${registryKey}=${normalizeRegistry(registry)}`;
  const lines = existing.split(/\r?\n/u);
  const keyPattern = /^\s*@nocobase:registry\s*=/u;
  const firstEntry = lines.findIndex((line) => keyPattern.test(line));
  const withoutDuplicates = lines.filter(
    (line, index) => index === firstEntry || !keyPattern.test(line),
  );

  if (firstEntry === -1) {
    while (withoutDuplicates.at(-1) === '') {
      withoutDuplicates.pop();
    }
    withoutDuplicates.push(
      '',
      '# NocoBase v3 packages are published on the NocoBase registry.',
      '# This scoped setting leaves unscoped dependencies on the default npm registry.',
      registryLine,
    );
  } else {
    withoutDuplicates[firstEntry] = registryLine;
  }

  while (withoutDuplicates.at(-1) === '') {
    withoutDuplicates.pop();
  }
  const next = `${withoutDuplicates.join('\n').replace(/^\n+/u, '')}\n`;
  if (next !== existing) {
    await writeFile(target, next, 'utf8');
  }
}

function normalizeRegistry(registry: string): string {
  const url = new URL(registry);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'The NocoBase registry must use HTTP(S) without embedded credentials.',
    );
  }

  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/u, '');
}
