import type { ApplicationNotConfiguredError } from '../config/not-configured.js';

/**
 * What a standalone start prints for an application that is not configured: what is missing, then the command that
 * fixes it.
 *
 * Only a standalone start says this, because only there is `pnpm nocobase config init` the answer. It is printed in place of the
 * error: a stack trace adds nothing to one instruction and pushes it off the screen.
 */
export function formatNotConfigured(
  error: Pick<
    ApplicationNotConfiguredError,
    'message' | 'key' | 'environmentVariable'
  >,
): string {
  const lines = [
    `This application is not configured: ${error.message.replace(/\.$/u, '')}.`,
    '',
    'Create the configuration with:',
    '  pnpm nocobase config init',
    '',
    'Run it inside dist/ for a built application.',
  ];
  if (error.key) {
    lines.push(
      error.environmentVariable
        ? `If a configuration file already exists, set ${error.key} in it, or ${error.environmentVariable} in the environment.`
        : `If a configuration file already exists, set ${error.key} in it.`,
    );
  }
  return lines.join('\n');
}
