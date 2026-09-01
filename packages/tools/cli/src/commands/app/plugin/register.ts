import { Args, Command, Flags } from '@oclif/core';
import path from 'node:path';

import {
  addDependencyCommand,
  appPackageManager,
  declaredDependencyRange,
  installedPluginDirectory,
  installedPluginVersion,
} from '../../../lib/plugin-install.ts';
import type { ManualClientPluginEdit } from '../../../lib/client-plugins.ts';
import type { ManualServerPluginEdit } from '../../../lib/server-plugins.ts';
import {
  applyPluginRegistration,
  planPluginRegistration,
  pluginPackageName,
} from '../../../lib/plugin-registration.ts';
import {
  classifyPluginError,
  pluginJsonFailure,
  pluginPlanForJson,
  pluginJsonSuccess,
} from '../../../lib/plugin-json.ts';
import { runAttached, runCommand } from '../../../lib/run-command.ts';
import { resolveAppRoot } from '../../../lib/workspace-app.ts';
import {
  applySkillsSync,
  formatSkillsSyncSummary,
  planSkillsSync,
} from '../../../lib/skills-sync.ts';

export default class AppPluginRegister extends Command {
  static override summary = 'Install a plugin and wire it into this app.';
  static override description =
    'Adds the plugin package as a dependency, registers it under nocobase.plugins, wires its exported client and server entries into the explicit application composition roots, and copies the skills it ships into .agents/skills.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> audit-log',
    '<%= config.bin %> <%= command.id %> @nocobase/app-plugin-audit-log',
    '<%= config.bin %> <%= command.id %> audit-log --version 1.2.0',
    '<%= config.bin %> <%= command.id %> audit-log --dry-run',
    '<%= config.bin %> <%= command.id %> audit-log --workspace-root . --app app-template-default',
  ];

  static override args = {
    name: Args.string({
      description:
        'Plugin to register: a short name such as audit-log, or a full @nocobase/app-plugin-* package name.',
      required: true,
    }),
  };

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    app: Flags.string({
      description:
        'Workspace app directory or package name. Requires --workspace-root.',
    }),
    'workspace-root': Flags.string({
      description:
        'Monorepo root. Selects app-template-default unless --app is provided.',
    }),
    version: Flags.string({
      description:
        'Version range to install. Defaults to workspace:^ in workspace mode and the latest published version otherwise.',
    }),
    disabled: Flags.boolean({
      default: false,
      description:
        'Register the plugin with enabled set to false, leaving its client and server entries unwired.',
    }),
    'no-install': Flags.boolean({
      default: false,
      description:
        'Do not run the package manager; the plugin must already be installed.',
    }),
    'no-skills': Flags.boolean({
      default: false,
      description: "Do not copy the plugin's skills into this app.",
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Print what would change without writing anything.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one machine-readable JSON result.',
    }),
  };

  public async run(): Promise<void> {
    try {
      await this.runUnsafe();
    } catch (error) {
      if (!this.argv.includes('--json')) throw error;
      this.logToStderr(
        JSON.stringify(
          pluginJsonFailure('plugin:register', classifyPluginError(error)),
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
  }

  private async runUnsafe(): Promise<void> {
    const { args, flags } = await this.parse(AppPluginRegister);
    const appRoot = await resolveAppRoot({
      app: flags.app,
      dir: flags.dir,
      workspaceRoot: flags['workspace-root'],
    });
    const dryRun = flags['dry-run'];
    const packageName = pluginPackageName(args.name);

    const installed = await this.install({
      appRoot,
      dryRun,
      packageName,
      skipInstall: flags['no-install'],
      json: flags.json,
      version:
        flags.version ??
        (flags['workspace-root'] === undefined ? undefined : 'workspace:^'),
    });
    if (installed === undefined) {
      return;
    }

    const plan = await planPluginRegistration({
      appRoot,
      dependencyRange: await this.dependencyRange(appRoot, packageName),
      enabled: !flags.disabled,
      packageName,
      pluginDirectory: installed,
    });

    if (!plan.changed) {
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess('plugin:register', 'success-noop', {
            appRoot,
            packageName,
            checked: [
              'dependency',
              'nocobase.plugins',
              'client/plugins.ts',
              'server/plugins.ts',
            ],
            notChecked: ['skills-content', 'runtime-behavior'],
          }),
        );
      } else {
        this.log(`${packageName} is already registered.`);
      }
      return;
    }
    const skillsPlan = flags['no-skills']
      ? undefined
      : await planSkillsSync({
          appPackageName: packageName,
          appRoot,
          plugins: [{ packageName, pluginDirectory: installed }],
        });
    if (dryRun) {
      const status =
        plan.manualClientEdit || plan.manualServerEdit
          ? 'partial-success'
          : 'success';
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess('plugin:register', status, {
            mode: 'dry-run',
            appRoot,
            packageName,
            plan: pluginPlanForJson(plan),
            skills: skillsPlan ?? { skipped: true, reason: '--no-skills' },
            commands: [],
          }),
        );
      } else {
        this.log(this.describe(plan, appRoot, true));
      }
      return;
    }

    await applyPluginRegistration(appRoot, plan);
    if (!flags.json) this.log(this.describe(plan, appRoot, false));

    if (flags['no-skills']) {
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess(
            'plugin:register',
            plan.manualClientEdit || plan.manualServerEdit
              ? 'partial-success'
              : 'success',
            {
              mode: 'register',
              appRoot,
              packageName,
              plan: pluginPlanForJson(plan),
              skills: { skipped: true, reason: '--no-skills' },
            },
          ),
        );
      }
      return;
    }
    // Skills are documentation: a failure here is reported but never undoes a registration that already succeeded.
    try {
      const synced = await applySkillsSync(skillsPlan!);
      if (synced.copies.length > 0 || synced.removals.length > 0) {
        if (!flags.json) this.log(formatSkillsSyncSummary(synced));
      }
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess(
            'plugin:register',
            plan.manualClientEdit || plan.manualServerEdit
              ? 'partial-success'
              : 'success',
            {
              mode: 'register',
              appRoot,
              packageName,
              plan: pluginPlanForJson(plan),
              skills: synced,
            },
          ),
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!flags.json) {
        this.warn(
          `${packageName} was registered, but its skills were not copied: ${reason}`,
        );
      }
      if (flags.json) {
        this.logJson(
          pluginJsonSuccess('plugin:register', 'partial-success', {
            mode: 'register',
            appRoot,
            packageName,
            plan: pluginPlanForJson(plan),
            issues: [classifyPluginError(error)],
          }),
        );
      }
    }
  }

  /**
   * The range to record in the manifest. After an install the package manager has already written one, so it wins;
   * otherwise the installed version supplies a caret range. A package with no readable version records `*`, which is
   * honest about not knowing rather than inventing a range the registry would reject.
   */
  private async dependencyRange(
    appRoot: string,
    packageName: string,
  ): Promise<string> {
    const declared = await declaredDependencyRange(appRoot, packageName);
    if (declared !== undefined) {
      return declared;
    }
    const version = await installedPluginVersion(appRoot, packageName);
    return version === undefined ? '*' : `^${version}`;
  }

  /** Ensures the package is present, returning where it lives, or undefined when the run should stop. */
  private async install({
    appRoot,
    dryRun,
    packageName,
    skipInstall,
    json,
    version,
  }: {
    appRoot: string;
    dryRun: boolean;
    packageName: string;
    skipInstall: boolean;
    json: boolean;
    version?: string;
  }): Promise<string | undefined> {
    const existing = await installedPluginDirectory(appRoot, packageName);
    if (skipInstall) {
      if (existing === undefined) {
        this.error(
          `${packageName} is not installed in ${appRoot} and --no-install was given.`,
          { exit: 1 },
        );
      }
      return existing;
    }

    const specifier =
      version === undefined ? packageName : `${packageName}@${version}`;
    const { args, packageManager } = addDependencyCommand(
      await appPackageManager(appRoot),
      specifier,
    );

    if (dryRun) {
      // Without the package there is nothing to inspect, so a dry run reports the install and stops rather than
      // guessing at edits it cannot compute.
      if (existing === undefined) {
        if (json) {
          this.logJson(
            pluginJsonSuccess('plugin:register', 'requires-installation', {
              appRoot,
              packageName,
              planStatus: 'requires-installation',
              commands: [{ command: packageManager, args, cwd: appRoot }],
              nextSteps: [
                'Install the plugin.',
                'Run plugin:register again to inspect exports and compute the registration plan.',
              ],
            }),
          );
        } else {
          this.log(
            `Would run: ${packageManager} ${args.join(' ')}\nThen register ${packageName}.`,
          );
        }
        return undefined;
      }
      return existing;
    }

    if (!json) this.log(`${packageManager} ${args.join(' ')}`);
    let exitCode = 0;
    if (json) {
      await runCommand(packageManager, [...args], { cwd: appRoot });
    } else {
      exitCode = await runAttached(packageManager, [...args], { cwd: appRoot });
    }
    if (exitCode !== 0) {
      this.error(
        `${packageManager} exited with code ${exitCode}. Nothing was registered.`,
        { exit: exitCode === 0 ? 1 : exitCode },
      );
    }

    const directory = await installedPluginDirectory(appRoot, packageName);
    if (directory === undefined) {
      this.error(
        `${packageManager} reported success but ${packageName} is not in node_modules.`,
        { exit: 1 },
      );
    }
    return directory;
  }

  private describe(
    plan: Awaited<ReturnType<typeof planPluginRegistration>>,
    appRoot: string,
    dryRun: boolean,
  ): string {
    const lines = [
      `${dryRun ? 'Would register' : 'Registered'} ${plan.packageName} as ${plan.enabled ? 'enabled' : 'disabled'}`,
    ];
    if (plan.manifestChanged) {
      lines.push('  package.json: dependency and nocobase.plugins');
    }
    if (plan.clientPluginsChanged) {
      lines.push(
        `  ${path.relative(appRoot, plan.clientPluginsPath)}: import and registration`,
      );
    }
    if (plan.serverPluginsChanged) {
      lines.push(
        `  ${path.relative(appRoot, plan.serverPluginsPath)}: import and registration`,
      );
    }
    if (plan.skippedClientEntry === 'no-client-entry') {
      lines.push(
        '  client/plugins.ts: skipped, this plugin ships no client entry',
      );
    }
    if (plan.skippedClientEntry === 'disabled') {
      lines.push('  client/plugins.ts: skipped, the plugin is disabled');
    }
    if (plan.skippedServerEntry === 'no-server-entry') {
      lines.push(
        '  server/plugins.ts: skipped, this plugin ships no server entry',
      );
    }
    if (plan.skippedServerEntry === 'disabled') {
      lines.push('  server/plugins.ts: skipped, the plugin is disabled');
    }
    if (plan.manualClientEdit) {
      lines.push(
        ...manualEditInstructions(plan.manualClientEdit, appRoot, dryRun),
      );
    }
    if (plan.manualServerEdit) {
      lines.push(
        ...manualEditInstructions(plan.manualServerEdit, appRoot, dryRun),
      );
    }
    return lines.join('\n');
  }
}

/**
 * Spells out the edit that could not be applied. The wording is deliberately literal — file, both lines, and where
 * each one goes — because the reader may be an agent with no view of the file, and "add the plugin to your client
 * entry" is not something it can act on.
 */
function manualEditInstructions(
  edit: ManualClientPluginEdit | ManualServerPluginEdit,
  appRoot: string,
  dryRun: boolean,
): string[] {
  const relativePath = path.relative(appRoot, edit.filePath);
  const registerCallName = relativePath.startsWith(`server${path.sep}`)
    ? 'defineServerPlugins'
    : 'defineClientPlugins';
  return [
    `  ${relativePath}: not edited, TypeScript is not installed in this app`,
    '',
    dryRun
      ? `Everything else would be done. ${relativePath} would need two lines added by hand:`
      : `Everything else is done. Add these two lines to ${relativePath} by hand:`,
    `  1. after the existing imports:  ${edit.importStatement}`,
    `  2. inside ${registerCallName}([...]):  ${edit.entry}`,
    '',
    'Or install TypeScript and re-run this command to have it written for you:',
    '  pnpm add -D typescript',
  ];
}
