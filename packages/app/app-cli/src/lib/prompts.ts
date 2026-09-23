import * as clack from '@clack/prompts';

import type { OfficialDialect } from '@nocobase/app-server/database';

/** Thrown when the user aborts a prompt with Ctrl+C, so the caller can exit quietly rather than print a stack. */
export class PromptCancelledError extends Error {
  public constructor() {
    super('Cancelled.');
    this.name = 'PromptCancelledError';
  }
}

/**
 * Asks which installed driver to configure.
 *
 * Only drivers that are actually installed are offered, so the prompt cannot produce a dialect the application is
 * unable to load — the "driver missing" path exists for `--dialect` and for scripted runs, not for this one.
 */
export async function selectDialect(
  available: readonly OfficialDialect[],
): Promise<OfficialDialect> {
  const choice = await clack.select({
    message: 'Which database should the main connection use?',
    options: available.map((dialect) => ({ value: dialect, label: dialect })),
  });

  if (clack.isCancel(choice)) {
    throw new PromptCancelledError();
  }

  return choice;
}
