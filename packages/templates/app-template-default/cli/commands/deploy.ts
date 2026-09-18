import { Command, Flags, type Interfaces } from '@oclif/core';
import path from 'node:path';
import { PublishingError, publishToHub } from '../hub-publishing.js';

export default class AppDeploy extends Command {
  static override summary = 'Deploy an existing Hub release.';
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
        'Runtime YAML configuration file. Omit to reuse the current Hub configuration.',
    }),
    hub: Flags.string({
      description:
        'Hub application URL. Defaults to HUB_URL in the environment or App root .env.',
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
  public async run(): Promise<void> {
    let parsed = false;
    let json = this.argv.includes('--json');
    try {
      const { flags } = await this.parse(AppDeploy);
      parsed = true;
      json = flags.json;
      const result = await publishToHub(
        'deploy',
        flags,
        path.resolve(import.meta.dirname, '..', '..'),
      );
      if (json)
        this.logJson({
          schemaVersion: 1,
          ok: true,
          operation: 'app.deploy',
          status: 'success',
          result,
        });
      else
        this.log(
          `Deployment ${String(result.operationId)}: ${String(result.operationStatus)}. Retry key: ${String(result.idempotencyKey)}.`,
        );
      if (!json && typeof result.warning === 'string')
        this.warn(result.warning);
    } catch (error) {
      const failure = !parsed
        ? new PublishingError(
            'INVALID_ARGUMENTS',
            'Invalid command arguments. Run this command with --help.',
            2,
          )
        : error instanceof PublishingError
          ? error
          : new PublishingError('DEPLOY_FAILED', 'Deployment failed.', 1);
      if (json)
        this.logJson({
          schemaVersion: 1,
          ok: false,
          operation: 'app.deploy',
          status: 'failure',
          error: {
            code: failure.code,
            message: failure.message,
            suggestions: [],
          },
        });
      else this.log(failure.message);
      this.exit(failure.exitCode);
    }
  }
}
