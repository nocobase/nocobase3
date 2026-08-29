import AppDeployRelease from '../commands/app/deploy.ts';
import AppPublish from '../commands/app/publish.ts';

/** The app-local default builds, publishes, and deploys. Release selectors keep the deployment-only workflow. */
export default class AppDeploy extends AppDeployRelease {
  static override summary = 'Release and deploy the current app to its Hub.';
  static override description =
    'With no Release selector, associates the local app when needed, builds and uploads the next patch Release, and deploys it. Use --release, --rollback, or --redeploy to operate on an existing Release.';

  static override examples = [
    'pnpm run deploy --hub https://hub.example.com/hub',
    'pnpm run deploy --hub https://hub.example.com/hub --app sales',
    'pnpm run deploy',
    'pnpm run deploy --release 1.4.0 --non-interactive',
    'pnpm run deploy --release 1.3.0 --rollback --yes --non-interactive',
    'pnpm run deploy --redeploy --non-interactive',
  ];

  public override async run(): Promise<void> {
    const { flags } = await this.parse(AppDeploy);
    if (usesExistingReleaseWorkflow(this.argv)) {
      await super.run();
      return;
    }

    if (flags.yes) {
      this.error('--yes is only available with --rollback.', { exit: 2 });
    }

    await new AppDeployPublish(
      [
        ...(flags.dir ? ['--dir', flags.dir] : []),
        ...(flags.hub ? ['--hub', flags.hub] : []),
        ...(flags.app ? ['--app', flags.app] : []),
        ...(flags['non-interactive'] ? ['--non-interactive'] : []),
        ...(flags['dry-run'] ? ['--dry-run'] : []),
        ...(flags.json ? ['--json'] : []),
        ...(flags['operation-id']
          ? ['--operation-id', flags['operation-id']]
          : []),
        '--bump',
        'patch',
        '--deploy',
      ],
      this.config,
    ).run();
  }
}

class AppDeployPublish extends AppPublish {
  protected override get publishSurface(): 'deploy' {
    return 'deploy';
  }
}

function usesExistingReleaseWorkflow(argv: readonly string[]): boolean {
  return argv.some(
    (argument) =>
      argument === '--release' ||
      argument.startsWith('--release=') ||
      argument === '--rollback' ||
      argument === '--redeploy',
  );
}
