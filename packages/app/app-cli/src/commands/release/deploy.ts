import { type Command, Flags, type Interfaces } from '@oclif/core';

import {
  ReleaseCommand,
  type ReleaseFlags,
} from '../../lib/release-command.ts';

export default class ReleaseDeploy extends ReleaseCommand {
  static override summary = 'Deploy an existing Hub release.';
  static override description =
    'Deploys a Release that is already on the Hub, such as one `release upload` created without --deploy, or an earlier Release to roll back to. It waits for the deployment to finish unless --no-wait is given.\n\nThe Hub, App ID and API key come from the flags, then HUB_URL, HUB_APP_ID and HUB_API_KEY in the environment, then the App root .env. Retrying with the same --idempotency-key is safe when a run could not confirm its result; deploying the same Release again needs a new key.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %> --release-id <release-id>',
    '<%= config.bin %> <%= command.id %> --release-id <release-id> --no-wait --json',
    '<%= config.bin %> <%= command.id %> --release-id <release-id> --config ./runtime.yml',
  ];

  static override flags: {
    config: Interfaces.OptionFlag<string | undefined>;
    hub: Interfaces.OptionFlag<string | undefined>;
    'app-id': Interfaces.OptionFlag<string | undefined>;
    'api-key': Interfaces.OptionFlag<string | undefined>;
    'release-id': Interfaces.OptionFlag<string>;
    'idempotency-key': Interfaces.OptionFlag<string | undefined>;
    wait: Interfaces.BooleanFlag<boolean>;
    timeout: Interfaces.OptionFlag<number>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    config: Flags.string({
      description:
        'Runtime YAML configuration to deploy with, relative to the current directory. Omit to reuse the current Hub configuration.',
    }),
    hub: Flags.string({
      description:
        'Hub application URL, including its base path. Defaults to HUB_URL in the environment or App root .env.',
    }),
    'app-id': Flags.string({
      description:
        'Target App ID. Defaults to HUB_APP_ID in the environment or App root .env.',
    }),
    'api-key': Flags.string({
      description:
        'Publishing API key. Defaults to HUB_API_KEY in the environment or App root .env.',
    }),
    'release-id': Flags.string({
      required: true,
      description: 'Immutable Release ID.',
    }),
    'idempotency-key': Flags.string({
      description:
        'Retry identity; defaults to a digest of App and Release IDs. Use a new key to redeploy.',
    }),
    wait: Flags.boolean({
      default: true,
      allowNo: true,
      description:
        'Wait for deployment success (default). Use --no-wait to return after acceptance.',
    }),
    timeout: Flags.integer({
      default: 600,
      description: 'Request and wait deadline in seconds.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print a single JSON result.',
    }),
  };

  protected readonly operation = 'deploy' as const;
  protected readonly failureCode = 'DEPLOY_FAILED';
  protected readonly failureMessage = 'Deployment failed.';

  protected async parseFlags(): Promise<ReleaseFlags> {
    return (await this.parse(ReleaseDeploy)).flags;
  }

  protected describe(result: Record<string, unknown>): string {
    return `Deployment ${String(result.operationId)}: ${String(result.operationStatus)}. Retry key: ${String(result.idempotencyKey)}.`;
  }
}
