import { Args, Flags } from '@oclif/core';
import type { Command, Interfaces } from '@oclif/core';
import path from 'node:path';

import { CommandError } from '../../command/errors.ts';
import { AppCommand } from '../../context.ts';
import type { PackageManager } from '../../lib/package-manager.ts';
import {
  describeUnsatisfiedPeer,
  findUnsatisfiedPeers,
  peerFixCommand,
  peerUpdateArgs,
  planPeerFixes,
  type UnsatisfiedPeer,
} from '../../lib/plugin-peers.ts';
import {
  planPluginUpdate,
  type PluginUpdatePlan,
} from '../../lib/plugin-update.ts';
import { runAttached, runCommand } from '../../lib/run-command.ts';
import {
  classifyPluginError,
  pluginCommandIssue,
  pluginError,
  type PluginCommandInvocation,
  type PluginCommandIssue,
} from '../../lib/plugin-json.ts';
import {
  applySkillsSync,
  formatSkillsSyncSummary,
  planSkillsSync,
  readAppPackage,
  resolveInstalledPlugins,
  type SkillsSyncPlan,
} from '../../lib/skills-sync.ts';

/** How many times a run updates peers before giving up on a chain that keeps asking for more. */
const MAX_PEER_UPDATE_ROUNDS = 5;

/** No plugin is registered, so there is nothing to upgrade; status `success-noop`. */
export interface PluginUpdateNoopResult {
  readonly appRoot: string;
  readonly packageNames: readonly string[];
  readonly commands: readonly PluginCommandInvocation[];
}

/** The upgrade a run would perform, and whose Skills it would then synchronize. */
export interface PluginUpdateDryRunResult extends PluginUpdatePlan {
  readonly mode: 'dry-run';
  readonly appRoot: string;
  readonly commands: readonly PluginCommandInvocation[];
  readonly synchronizeSkills: readonly string[];
}

/** Peers an upgrade left unsatisfied, and the update within the application's declared ranges that fixed them. */
export interface PluginPeerUpdate {
  readonly packageNames: readonly string[];
  readonly args: readonly string[];
  readonly unsatisfiedPeers: readonly UnsatisfiedPeer[];
}

/**
 * The upgrade that ran, the peers it had to update so every upgraded plugin's peers are satisfied (`peerUpdates`,
 * empty when none were needed), and the Skills it synchronized. Status `partial-success` when the upgrade succeeded
 * but the Skills could not be synchronized (`issues`, and no `skills`).
 */
export interface PluginUpdateUpdatedResult extends PluginUpdatePlan {
  readonly mode: 'update';
  readonly appRoot: string;
  readonly peerUpdates: readonly PluginPeerUpdate[];
  readonly skills?: SkillsSyncPlan;
  readonly issues?: readonly PluginCommandIssue[];
}

export type PluginUpdateResult =
  PluginUpdateNoopResult | PluginUpdateDryRunResult | PluginUpdateUpdatedResult;

export default class PluginUpdate extends AppCommand {
  static override summary = 'Upgrade plugins and re-synchronize their Skills.';
  static override description =
    "Upgrades the plugin packages through the package manager the app already uses, then re-synchronizes all registered plugins' skills into .agents/skills. Specify a full package name or a short name. Without a name every registered plugin is upgraded. The skills copy is the reason to prefer this over upgrading by hand: skills live in the app, so an upgrade leaves a stale copy behind until something re-runs the sync. After the upgrade, every upgraded plugin's peer dependencies are checked against the installed versions; a peer that is no longer satisfied is updated within the app's declared range, and when that cannot satisfy it the command fails naming the plugin, the peer, the required range and the installed version.";

  static override examples: Command.Example[] = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> @nocobase/app-plugin-workflow',
    '<%= config.bin %> <%= command.id %> workflow',
    '<%= config.bin %> <%= command.id %> --dry-run',
  ];

  static override args: {
    name: Interfaces.Arg<string | undefined>;
  } = {
    name: Args.string({
      description:
        'Plugin to upgrade: a full @nocobase/app-plugin-* package name or a short name such as workflow. Omit to upgrade every registered plugin.',
      required: false,
    }),
  };

  static override flags: {
    dir: Interfaces.OptionFlag<string | undefined>;
    'dry-run': Interfaces.BooleanFlag<boolean>;
  } = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Print what would run without upgrading anything.',
    }),
  };

  public async run(): Promise<PluginUpdateResult> {
    const { args, flags } = await this.parse(PluginUpdate);
    try {
      return await this.update(args.name, flags);
    } catch (error) {
      throw classifyPluginError(error);
    }
  }

  private async update(
    name: string | undefined,
    flags: { readonly dir?: string; readonly 'dry-run': boolean },
  ): Promise<PluginUpdateResult> {
    const appRoot = path.resolve(flags.dir ?? process.cwd());
    const dryRun = flags['dry-run'];

    const plan = await planPluginUpdate({
      appRoot,
      plugins: name === undefined ? [] : [name],
    });
    if (plan.packageNames.length === 0) {
      this.setStatus('success-noop');
      this.log('No plugins are registered in this app.');
      return { appRoot, packageNames: [], commands: [] };
    }

    if (dryRun) {
      // A dry run changes nothing, whatever it would do.
      this.setStatus('success-noop');
      this.log(
        `Would run: ${plan.packageManager} ${plan.args.join(' ')}\nThen update any peer dependency the upgraded plugins no longer satisfy, within the app's declared ranges\nThen synchronize the skills of: ${plan.packageNames.join(', ')}`,
      );
      return {
        mode: 'dry-run',
        appRoot,
        ...plan,
        commands: [
          {
            command: plan.packageManager,
            args: plan.args,
            cwd: appRoot,
          },
        ],
        synchronizeSkills: plan.packageNames,
      };
    }

    await this.runPackageManager(plan.packageManager, plan.args, appRoot);
    const peerUpdates = await this.satisfyPeers(
      appRoot,
      plan.packageManager as PackageManager,
      plan.packageNames,
    );

    // The upgrade already succeeded, so a sync failure must not read as an
    // upgrade failure.
    try {
      const { appPackageName, plugins } = await resolveInstalledPlugins({
        appRoot,
      });
      const synced = await applySkillsSync(
        await planSkillsSync({
          appPackageName,
          appRoot,
          plugins,
          pruneMissingPackages: true,
        }),
      );
      this.log(formatSkillsSyncSummary(synced));
      return {
        mode: 'update',
        appRoot,
        ...plan,
        peerUpdates,
        skills: synced,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.warn(
        `Plugins were upgraded, but their skills were not synchronized: ${reason}`,
      );
      this.setStatus('partial-success');
      return {
        mode: 'update',
        appRoot,
        ...plan,
        peerUpdates,
        issues: [pluginCommandIssue(error)],
      };
    }
  }

  /**
   * Updates the peers `packageNames` no longer satisfy, within the application's declared ranges, until none is left.
   * A package this updates is checked in turn, since its new version may need newer peers of its own. Fails, before
   * the skills are touched, when a peer cannot be satisfied that way.
   */
  private async satisfyPeers(
    appRoot: string,
    packageManager: PackageManager,
    packageNames: readonly string[],
  ): Promise<PluginPeerUpdate[]> {
    const checked = new Set(packageNames);
    const updated = new Set<string>();
    const peerUpdates: PluginPeerUpdate[] = [];
    for (let round = 0; ; round += 1) {
      // Read each round: an update may rewrite the declared ranges.
      const applicationPackage = await readAppPackage(appRoot);
      const unsatisfied = await findUnsatisfiedPeers({
        appRoot,
        packageNames: [...checked],
      });
      if (unsatisfied.length === 0) return peerUpdates;

      const { updatable, blocked } = planPeerFixes({
        applicationPackage,
        unsatisfied,
        alreadyUpdated: updated,
      });
      if (blocked.length > 0 || round >= MAX_PEER_UPDATE_ROUNDS) {
        throw this.unsatisfiedPeersError(
          packageManager,
          applicationPackage,
          unsatisfied,
          new Set(updatable),
          peerUpdates,
        );
      }

      const args = peerUpdateArgs(
        packageManager,
        applicationPackage,
        updatable,
      );
      this.log(
        [
          'Updating peers the upgraded plugins need:',
          ...unsatisfied.map((entry) => `  ${describeUnsatisfiedPeer(entry)}`),
        ].join('\n'),
      );
      await this.runPackageManager(packageManager, args, appRoot);
      peerUpdates.push({
        packageNames: updatable,
        args,
        unsatisfiedPeers: unsatisfied,
      });
      for (const packageName of updatable) {
        updated.add(packageName);
        checked.add(packageName);
      }
    }
  }

  private unsatisfiedPeersError(
    packageManager: PackageManager,
    applicationPackage: Record<string, unknown>,
    unsatisfied: readonly UnsatisfiedPeer[],
    updatable: ReadonlySet<string>,
    peerUpdates: readonly PluginPeerUpdate[],
  ): Error {
    const byPeer = new Map<string, UnsatisfiedPeer[]>();
    for (const entry of unsatisfied) {
      byPeer.set(entry.peer, [...(byPeer.get(entry.peer) ?? []), entry]);
    }
    return new CommandError(
      [
        "The upgraded plugins need peer dependency versions this app's declared ranges do not provide:",
        ...unsatisfied.map((entry) => `  ${describeUnsatisfiedPeer(entry)}`),
        'The plugins were upgraded; the skills were left untouched.',
      ].join('\n'),
      {
        code: 'PLUGIN_PEER_UNSATISFIED',
        details: { unsatisfiedPeers: unsatisfied, peerUpdates },
        suggestions: [
          ...[...byPeer].map(([peer, entries]) => ({
            message: `Install a ${peer} the plugins accept:`,
            run: peerFixCommand(
              packageManager,
              applicationPackage,
              peer,
              entries,
              updatable.has(peer),
            ),
          })),
          {
            message: 'Then check the peers again and synchronize the skills:',
            run: this.cliCommand(['plugin', 'update']),
          },
        ],
      },
    );
  }

  /**
   * Runs the package manager. Under --json its own output would corrupt the one document on stdout, so it is collected
   * instead of shown; a failure then surfaces as the error the run fails with.
   */
  private async runPackageManager(
    packageManager: string,
    args: readonly string[],
    appRoot: string,
  ): Promise<void> {
    this.log(`${packageManager} ${args.join(' ')}`);
    if (this.jsonEnabled()) {
      await runCommand(packageManager, [...args], { cwd: appRoot });
      return;
    }
    const exitCode = await runAttached(packageManager, [...args], {
      cwd: appRoot,
    });
    if (exitCode !== 0) {
      throw pluginError(
        `${packageManager} exited with code ${exitCode}. The skills were left untouched.`,
        { exit: exitCode },
      );
    }
  }
}
