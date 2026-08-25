import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Command, Flags } from '@oclif/core';
import { HubCredentialManager } from '../../lib/hub-auth.ts';
import { failHubCommand } from '../../lib/hub-command.ts';
import {
  normalizeHubUrl,
  type Deployment,
  type Release,
} from '../../lib/hub-client.ts';
import {
  createOperation,
  loadOperation,
  updateOperation,
} from '../../lib/operation-store.ts';
import {
  listAllReleases,
  resolveApplication,
  resolveRelease,
  resolveRemoteApplicationContext,
  waitForDeployment,
} from '../../lib/hub-workflow.ts';
import { formatShellCommand } from '../../lib/shell.ts';

export default class AppDeploy extends Command {
  static override summary = 'Deploy the app to a hub.';
  static override description =
    'Deploys an existing Hub Release, rolls back to a previous Release, or redeploys the active Release.';

  static override examples = [
    '<%= config.bin %> <%= command.id %> --release 1.4.0 --non-interactive',
    '<%= config.bin %> <%= command.id %> --app sales --release 1.4.0 --hub https://hub.example.com/hub --json',
    '<%= config.bin %> <%= command.id %> --release 1.3.0 --rollback --yes --non-interactive',
  ];

  static override flags = {
    dir: Flags.string({
      description: 'App directory. Defaults to the current directory.',
    }),
    app: Flags.string({
      description: 'Application ID or exact slug. Defaults to the local app.',
    }),
    release: Flags.string({
      description: 'Release ID or exact semantic version to deploy.',
    }),
    hub: Flags.string({
      description:
        'Public Hub root URL. Defaults to the local app configuration.',
    }),
    rollback: Flags.boolean({
      default: false,
      description: 'Roll back to a previously successful Release.',
    }),
    redeploy: Flags.boolean({
      default: false,
      description: 'Redeploy the currently active Release.',
    }),
    'non-interactive': Flags.boolean({
      default: false,
      description: 'Never prompt for missing input or confirmation.',
    }),
    yes: Flags.boolean({
      default: false,
      description: 'Confirm a high-risk rollback without prompting.',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description:
        'Validate and print the deployment plan without creating it.',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Print one JSON result to stdout.',
    }),
    'operation-id': Flags.string({
      description: 'Resume or replay this deployment operation.',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(AppDeploy);
    const operationId = flags['operation-id'] ?? randomUUID();
    let hub: string | undefined = flags.hub;
    try {
      if (flags.rollback && flags.redeploy) {
        throw new Error('--rollback and --redeploy cannot be used together.');
      }
      if (
        flags.rollback &&
        flags['non-interactive'] &&
        !flags.yes &&
        !flags['dry-run']
      ) {
        throw new Error(
          'A non-interactive rollback requires --yes. Example: nb3 app deploy --release <version> --rollback --non-interactive --yes',
        );
      }
      const context = await resolveRemoteApplicationContext({
        directory: flags.dir,
        hub: flags.hub,
        application: flags.app,
      });
      const normalizedHub = normalizeHubUrl(context.hub);
      hub = normalizedHub;
      const requestedType: DeploymentType = flags.rollback
        ? 'rollback'
        : flags.redeploy
          ? 'redeploy'
          : 'deploy';
      const operation = await createOperation({
        kind: 'app-deploy',
        operationId,
        hubUrl: normalizedHub,
        idempotencyKey: operationId,
        parameters: {
          dryRun: String(flags['dry-run']),
          type: requestedType,
        },
        step: 'initialized',
      });
      const recordedType = operation.resourceIds?.deploymentType as
        DeploymentType | undefined;
      if (
        recordedType &&
        (flags.rollback || flags.redeploy) &&
        recordedType !== requestedType
      ) {
        throw new Error(
          `Operation ${operationId} is a ${recordedType}, not a ${requestedType}. Use a new operation ID.`,
        );
      }
      const type = recordedType ?? requestedType;
      const requiredScope =
        type === 'rollback'
          ? 'deployments:rollback'
          : type === 'redeploy'
            ? 'deployments:redeploy'
            : 'deployments:deploy';
      const result = await new HubCredentialManager(normalizedHub).authorized(
        ['apps:read', 'releases:read', 'deployments:read', requiredScope],
        async (client) => {
          const application = await resolveApplication(
            client,
            operation.resourceIds?.applicationId ??
              context.applicationReference,
          );
          if (
            operation.resourceIds?.applicationId &&
            context.applicationReference &&
            context.applicationReference !== application.id &&
            context.applicationReference !== application.slug
          ) {
            throw new Error(
              `Operation ${operationId} belongs to application ${application.slug}, not ${context.applicationReference}. Use a new operation ID.`,
            );
          }
          const releases = await listAllReleases(client, application.id);
          const recordedReleaseId = operation.resourceIds?.releaseId;
          const release = recordedReleaseId
            ? resolveRelease(releases, recordedReleaseId)
            : resolveDeploymentRelease({
                activeReleaseId: application.activeRelease?.id,
                activeReleaseVersion: application.activeRelease?.version,
                releases,
                requestedRelease: flags.release,
                type,
              });
          if (recordedReleaseId && flags.release) {
            const requestedRelease = resolveRelease(releases, flags.release);
            if (requestedRelease.id !== recordedReleaseId) {
              throw new Error(
                `Operation ${operationId} already targets Release ${operation.resourceIds?.releaseVersion ?? release.version}; use a new operation ID to target ${requestedRelease.version}.`,
              );
            }
          }
          await updateOperation(operationId, (current) => ({
            ...current,
            resourceIds: {
              ...(current.resourceIds ?? {}),
              applicationId: application.id,
              releaseId: release.id,
              releaseVersion: release.version,
              deploymentType: type,
            },
            step: current.resourceIds?.deploymentId ? current.step : 'planned',
          }));
          if (flags['dry-run']) {
            return {
              application,
              deployment: undefined,
              dryRun: true as const,
              release,
              type,
            };
          }
          if (
            type === 'rollback' &&
            !flags.yes &&
            !operation.resourceIds?.deploymentId &&
            !(await confirmRollback(application.slug, release.version))
          ) {
            throw new Error('Rollback cancelled.');
          }
          const existingDeploymentId = operation.resourceIds?.deploymentId;
          const deployment = existingDeploymentId
            ? await client.getDeployment(existingDeploymentId)
            : await client.createDeployment(
                application.id,
                { targetReleaseId: release.id, type },
                operationId,
              );
          await updateOperation(operationId, (current) => ({
            ...current,
            deployment: toOperationDeployment(deployment),
            resourceIds: {
              ...(current.resourceIds ?? {}),
              applicationId: application.id,
              releaseId: release.id,
              deploymentId: deployment.id,
            },
            step: 'deployment-created',
          }));
          const completed = await waitForDeployment(client, deployment);
          await updateOperation(operationId, (current) => ({
            ...current,
            deployment: toOperationDeployment(completed),
            step: 'completed',
          }));
          return {
            application,
            deployment: completed,
            dryRun: false as const,
            release,
            type,
          };
        },
      );
      this.printResult(result, normalizedHub, operationId, flags.json);
    } catch (error) {
      const journal = await loadOperation(operationId).catch(() => undefined);
      failHubCommand(
        this,
        error,
        flags.json,
        deployFailureHint(
          flags,
          hub,
          operationId,
          journal?.resourceIds,
          journal?.parameters,
        ),
        operationId,
        {
          ...(journal?.deployment ? { deployment: journal.deployment } : {}),
          ...(journal?.resourceIds?.releaseId
            ? {
                release: {
                  id: journal.resourceIds.releaseId,
                  version: journal.resourceIds.releaseVersion,
                },
              }
            : {}),
        },
      );
    }
  }

  private printResult(
    result: {
      readonly application: {
        readonly id: string;
        readonly slug: string;
        readonly name: string;
        readonly links?: { readonly open?: string | null };
      };
      readonly deployment?: Deployment;
      readonly dryRun: boolean;
      readonly release: Release;
      readonly type: 'deploy' | 'rollback' | 'redeploy';
    },
    hub: string,
    operationId: string,
    json: boolean,
  ): void {
    const output = {
      ok: true,
      operationId,
      hub,
      dryRun: result.dryRun,
      type: result.type,
      application: {
        id: result.application.id,
        slug: result.application.slug,
        name: result.application.name,
        url: result.application.links?.open ?? null,
      },
      release: result.release,
      ...(result.deployment ? { deployment: result.deployment } : {}),
    };
    if (json) {
      this.log(JSON.stringify(output));
      return;
    }
    if (result.dryRun) {
      this.log(
        `Dry run: ${result.type} ${result.application.slug} to ${result.release.version}.`,
      );
      return;
    }
    this.log(
      `${deploymentVerb(result.type)} ${result.application.slug} to ${result.release.version}.`,
    );
    this.log(`deployment_id: ${result.deployment?.id}`);
    this.log(`status: ${result.deployment?.status}`);
    this.log(`operation_id: ${operationId}`);
  }
}

function resolveDeploymentRelease(input: {
  readonly activeReleaseId?: string;
  readonly activeReleaseVersion?: string;
  readonly releases: readonly Release[];
  readonly requestedRelease?: string;
  readonly type: 'deploy' | 'rollback' | 'redeploy';
}): Release {
  const reference =
    input.requestedRelease ??
    (input.type === 'redeploy'
      ? (input.activeReleaseId ?? input.activeReleaseVersion)
      : undefined);
  if (!reference) {
    throw new Error(
      input.type === 'redeploy'
        ? 'The application has no active Release to redeploy.'
        : 'Specify --release <id-or-version>. Example: nb3 app deploy --release 1.4.0 --non-interactive',
    );
  }
  const release = resolveRelease(input.releases, reference);
  if (
    input.type === 'redeploy' &&
    input.activeReleaseId &&
    release.id !== input.activeReleaseId
  ) {
    throw new Error('A redeploy must target the currently active Release.');
  }
  return release;
}

type DeploymentType = 'deploy' | 'rollback' | 'redeploy';

function toOperationDeployment(
  deployment: Deployment,
): import('../../lib/operation-store.ts').OperationDeployment {
  return {
    id: deployment.id,
    applicationId: deployment.applicationId,
    targetReleaseId: deployment.targetReleaseId,
    type: deployment.type,
    status: deployment.status,
  };
}

function deployFailureHint(
  flags: {
    readonly app?: string;
    readonly dir?: string;
    readonly release?: string;
    readonly rollback: boolean;
    readonly redeploy: boolean;
    readonly yes: boolean;
    readonly 'dry-run': boolean;
  },
  hub: string | undefined,
  operationId: string,
  recorded: Readonly<Record<string, string>> | undefined,
  recordedParameters: Readonly<Record<string, string>> | undefined,
): string {
  const parts = ['nb3', 'app', 'deploy'];
  if (flags.dir) parts.push('--dir', flags.dir);
  const application = recorded?.applicationId ?? flags.app;
  if (application) parts.push('--app', application);
  if (hub) parts.push('--hub', hub);
  const release = recorded?.releaseVersion ?? flags.release;
  if (release) parts.push('--release', release);
  const type = recorded?.deploymentType ?? recordedParameters?.type;
  if (type === 'rollback' || flags.rollback) parts.push('--rollback');
  if (type === 'redeploy' || flags.redeploy) parts.push('--redeploy');
  if (flags.yes) parts.push('--yes');
  if (
    recordedParameters ? recordedParameters.dryRun === 'true' : flags['dry-run']
  ) {
    parts.push('--dry-run');
  }
  parts.push('--operation-id', operationId, '--non-interactive');
  return formatShellCommand(parts);
}

async function confirmRollback(
  slug: string,
  version: string,
): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Rollback confirmation is unavailable without a terminal. Pass --yes to confirm.',
    );
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = await prompt.question(
      `Rollback ${slug} to ${version}? Type the app slug to confirm: `,
    );
    return answer.trim() === slug;
  } finally {
    prompt.close();
  }
}

function deploymentVerb(type: 'deploy' | 'rollback' | 'redeploy'): string {
  if (type === 'rollback') return 'Rolled back';
  if (type === 'redeploy') return 'Redeployed';
  return 'Deployed';
}
