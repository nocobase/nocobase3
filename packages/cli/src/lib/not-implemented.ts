import type { Command } from '@oclif/core';

/**
 * Fails a command that cannot be built yet, naming what is missing.
 *
 * Deploying, pulling, and listing apps all talk to a hub app API that the v3 hub does not expose yet — it currently
 * serves only a health check and an API proxy. These commands exit non-zero rather than printing a placeholder,
 * because a script that deploys and sees success would be badly misled.
 */
export function failNotImplemented(command: Command, reason: string): never {
  return command.error(
    [
      `${(command.id ?? '').split(':').join(' ')} is not implemented yet.`,
      reason,
    ].join('\n'),
    {
      exit: 3,
    },
  );
}

export const HUB_API_MISSING =
  'It needs an app API on the hub, which the v3 hub does not provide yet. Track the hub work before relying on this.';
