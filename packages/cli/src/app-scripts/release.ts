import { Command } from '@oclif/core';
import AppPublish from '../commands/app/publish.ts';

export default class AppRelease extends Command {
  static override summary = 'Create a Hub Release from the current app.';
  static override description =
    'Synchronizes the source snapshot, builds the app, and creates a verified immutable Release without deploying it.';

  static override examples = [
    'pnpm run release --bump patch',
    'pnpm run release --version 1.4.0 --json',
  ];

  static override flags = withoutDeployFlag(AppPublish.flags);

  public async run(): Promise<void> {
    await this.parse(AppRelease);
    await new AppPublish(this.argv, this.config).run();
  }
}

function withoutDeployFlag(
  flags: typeof AppPublish.flags,
): Omit<typeof AppPublish.flags, 'deploy'> {
  const { deploy: _deploy, ...releaseFlags } = flags;
  return releaseFlags;
}
