import { type Command, Flags, type Interfaces } from '@oclif/core';

import { appPath } from '../../command/flags.ts';
import {
  DEFAULT_ARTIFACT,
  publishRelease,
  type PublishedRelease,
  type PublishingOptions,
  type ReleaseUploadResult,
} from '../../hub-publishing.ts';
import { ReleaseCommand } from '../../lib/release-command.ts';

export default class ReleaseUpload extends ReleaseCommand<ReleaseUploadResult> {
  static override summary = 'Upload an immutable application release to Hub.';
  static override description =
    'Uploads the archive `nocobase build --tar` writes, storage/exports/dist.tar.gz, as a new Release of the App on the Hub. The Release is immutable: uploading the same archive again returns the existing Release instead of creating another. With --deploy, the upload also starts a deployment and waits for it to finish unless --no-wait is given.\n\nThe Hub, App ID and API key come from the flags, then HUB_URL, HUB_APP_ID and HUB_API_KEY in the environment, then the App root .env. Retrying with the same --idempotency-key is safe when a run could not confirm its result.';

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --deploy --json',
    '<%= config.bin %> <%= command.id %> --deploy --config ./runtime.yml',
    '<%= config.bin %> <%= command.id %> --file ./artifacts/dist.tar.gz',
  ];

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
  } = {
    config: appPath({
      description:
        'Runtime YAML configuration to deploy with, relative to the current directory. Requires --deploy. Omit to reuse the current Hub configuration.',
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
    file: appPath({
      default: DEFAULT_ARTIFACT,
      description: 'Archive to upload, relative to the current directory.',
    }),
    'idempotency-key': Flags.string({
      description: 'Retry identity. Defaults to the archive SHA-256.',
    }),
    deploy: Flags.boolean({
      default: false,
      description: 'Upload and accept one deployment atomically.',
    }),
    wait: Flags.boolean({
      allowNo: true,
      description:
        'Wait for deployment success, the default with --deploy. Use --no-wait to return after acceptance.',
    }),
    timeout: Flags.integer({
      default: 600,
      description: 'Request and wait deadline in seconds.',
    }),
  };

  protected readonly failureCode = 'PUBLISH_FAILED';
  protected readonly failureMessage = 'Publishing failed.';

  protected async parseFlags(): Promise<PublishingOptions> {
    return (await this.parse(ReleaseUpload)).flags;
  }

  protected publish(
    flags: PublishingOptions,
    root: string,
  ): Promise<PublishedRelease<ReleaseUploadResult>> {
    return publishRelease('upload', flags, root);
  }

  protected describe(result: ReleaseUploadResult): string {
    const deployment = result.operationId ?? 'not requested';
    return `Release ${result.releaseId} uploaded${result.reused ? ' (reused)' : ''}. Deployment: ${deployment}.`;
  }
}
