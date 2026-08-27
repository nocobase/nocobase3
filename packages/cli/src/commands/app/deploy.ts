import { Command, Flags } from '@oclif/core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAppProject, writeAppConfig } from '../../lib/app-project.ts';
import { uploadReleaseArchive } from '../../lib/hub-release-client.ts';
import { detectPackageManager } from '../../lib/package-manager.ts';
import { prepareReleaseArchive } from '../../lib/release-artifact.ts';
import { runAttached } from '../../lib/run-command.ts';

export default class AppDeploy extends Command {
  static override summary = 'Deploy the app to a hub.';
  static override description =
    'Builds the App, uploads only its immutable release artifact, and asks Hub to activate it. Source code is never uploaded.';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --hub http://127.0.0.1:13001/hub --token $NOCOBASE_HUB_TOKEN',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    hub: Flags.string({
      description: 'Target hub URL. Defaults to the hub recorded in .nb3/.',
    }),
    token: Flags.string({
      description:
        'Hub deployment token. Defaults to NOCOBASE_HUB_TOKEN and is never stored in .nb3/.',
    }),
    'release-id': Flags.string({
      description:
        'Immutable release id. Defaults to a deterministic version and artifact checksum id.',
    }),
    build: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Run the App build before packaging the release.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print the deployment result as JSON.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppDeploy);

    // Resolve first so failures point to the App project before checking deployment configuration.
    const project = await requireAppProject(flags.dir);
    const hub = flags.hub ?? project.config.hub;
    const token = flags.token ?? process.env.NOCOBASE_HUB_TOKEN;

    if (!hub) {
      this.error(
        [
          'No hub to deploy to.',
          `Pass --hub, or record one with \`${this.config.bin} app config hub <url>\`.`,
        ].join('\n'),
      );
    }
    if (!token?.trim()) {
      this.error(
        'No Hub deployment token. Pass --token or set NOCOBASE_HUB_TOKEN.',
      );
    }
    const packageJson = JSON.parse(
      await readFile(path.join(project.directory, 'package.json'), 'utf8'),
    ) as { packageManager?: string; scripts?: Record<string, string> };
    const packageManager = await detectPackageManager(
      project.directory,
      packageJson.packageManager,
    );
    if (flags.build) {
      if (!packageJson.scripts?.build) {
        this.error(
          `"${project.config.name}" has no build script in its package.json.`,
        );
      }
      this.log(`Building ${project.config.name}...`);
      const exitCode = await runAttached(packageManager, ['run', 'build'], {
        cwd: project.directory,
      });
      if (exitCode !== 0) this.exit(exitCode);
    }

    this.log('Packaging immutable release artifact...');
    const prepared = await prepareReleaseArchive({
      project,
      packageManager,
      releaseId: flags['release-id'],
    });
    try {
      this.log(
        `Uploading ${prepared.manifest.appId}/${prepared.manifest.releaseId} to Hub...`,
      );
      const result = await uploadReleaseArchive({
        hub,
        token: token.trim(),
        archivePath: prepared.archivePath,
        manifest: prepared.manifest,
      });
      if (result.deployment?.status === 'failed') {
        this.error(
          result.deployment.error?.message ?? 'Hub rejected the deployment.',
        );
      }
      if (flags.hub && project.config.hub !== flags.hub) {
        await writeAppConfig(project, { ...project.config, hub: flags.hub });
      }
      if (flags.json) {
        this.logJson(result);
        return;
      }
      if (result.approval) {
        this.log(
          `Uploaded ${prepared.manifest.releaseId}; deployment approval ${result.approval.id} is pending.`,
        );
      } else {
        this.log(
          `Deployed ${prepared.manifest.appId}@${result.deployment?.activeVersion ?? prepared.manifest.version} (${prepared.manifest.releaseId}).`,
        );
      }
    } finally {
      await prepared.remove();
    }
  }
}
