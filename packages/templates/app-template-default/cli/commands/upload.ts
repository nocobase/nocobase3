import { Command, Flags, type Interfaces } from '@oclif/core';
import path from 'node:path';
import { PublishingError, publishToHub } from '../hub-publishing.js';

export default class AppUpload extends Command {
  static override summary = 'Upload an immutable application release to Hub.';
  static override flags: {
    config: Interfaces.OptionFlag<string | undefined>;
    hub: Interfaces.OptionFlag<string | undefined>;
    'app-id': Interfaces.OptionFlag<string | undefined>;
    'api-key': Interfaces.OptionFlag<string | undefined>;
    file: Interfaces.OptionFlag<string>;
    'idempotency-key': Interfaces.OptionFlag<string | undefined>;
    deploy: Interfaces.BooleanFlag<boolean>;
    wait: Interfaces.BooleanFlag<boolean | undefined>;
    timeout: Interfaces.OptionFlag<number>;
    json: Interfaces.BooleanFlag<boolean>;
  } = {
    config: Flags.string({
      description:
        'Runtime YAML configuration file. Omit to reuse the current Hub configuration.',
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
    file: Flags.string({
      description: 'Artifact path.',
      default: 'storage/exports/dist.tar.gz',
    }),
    'idempotency-key': Flags.string({
      description: 'Retry identity. Defaults to artifact SHA-256.',
    }),
    deploy: Flags.boolean({
      default: false,
      description: 'Upload and accept one deployment atomically.',
    }),
    wait: Flags.boolean({
      allowNo: true,
      description:
        'Wait for deployment success by default with --deploy. Use --no-wait to return after acceptance.',
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
      const { flags } = await this.parse(AppUpload);
      parsed = true;
      json = flags.json;
      const result = await publishToHub(
        'upload',
        flags,
        path.resolve(import.meta.dirname, '..', '..'),
      );
      const response = {
        schemaVersion: 1,
        ok: true,
        operation: 'app.upload',
        status: 'success',
        result,
      };
      if (json) this.logJson(response);
      else
        this.log(
          `Release ${String(result.releaseId)} uploaded${result.reused ? ' (reused)' : ''}. Deployment: ${String(result.operationId ?? 'not requested')}.`,
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
          : new PublishingError('PUBLISH_FAILED', 'Publishing failed.', 1);
      const response = {
        schemaVersion: 1,
        ok: false,
        operation: 'app.upload',
        status: 'failure',
        error: {
          code: failure.code,
          message: failure.message,
          suggestions: [],
        },
      };
      if (json) this.logJson(response);
      else this.log(failure.message);
      this.exit(failure.exitCode);
    }
  }
}
