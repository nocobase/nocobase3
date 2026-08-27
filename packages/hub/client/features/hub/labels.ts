type Translate = (key: string, defaultMessage?: string) => string;

type LabelDefinition = {
  i18nKey: string;
  defaultLabel: string;
};

const roleLabels: Record<string, LabelDefinition> = {
  owner: { i18nKey: 'hub.roles.owner', defaultLabel: 'Owner' },
  admin: { i18nKey: 'hub.roles.admin', defaultLabel: 'Admin' },
  developer: { i18nKey: 'hub.roles.developer', defaultLabel: 'Developer' },
  deployer: { i18nKey: 'hub.roles.deployer', defaultLabel: 'Deployer' },
  viewer: { i18nKey: 'hub.roles.viewer', defaultLabel: 'Viewer' },
};

const roleScopeLabels: Record<string, LabelDefinition> = {
  global: { i18nKey: 'hub.roleScope.global', defaultLabel: 'Global' },
  application: {
    i18nKey: 'hub.roleScope.application',
    defaultLabel: 'Application',
  },
};

const capabilityResourceLabels: Record<string, LabelDefinition> = {
  '*': {
    i18nKey: 'hub.capability.resource.all',
    defaultLabel: 'All resources',
  },
  'hub.app': {
    i18nKey: 'hub.capability.resource.app',
    defaultLabel: 'Applications',
  },
  'hub.release': {
    i18nKey: 'hub.capability.resource.release',
    defaultLabel: 'Releases',
  },
  'hub.deployment': {
    i18nKey: 'hub.capability.resource.deployment',
    defaultLabel: 'Deployments',
  },
  'hub.runtime': {
    i18nKey: 'hub.capability.resource.runtime',
    defaultLabel: 'Runtime',
  },
  'hub.runtimeSecret': {
    i18nKey: 'hub.capability.resource.runtimeSecret',
    defaultLabel: 'Runtime secrets',
  },
  'hub.auditLog': {
    i18nKey: 'hub.capability.resource.auditLog',
    defaultLabel: 'Audit log',
  },
  'hub.member': {
    i18nKey: 'hub.capability.resource.member',
    defaultLabel: 'Members',
  },
  'hub.permission': {
    i18nKey: 'hub.capability.resource.permission',
    defaultLabel: 'Permissions',
  },
  'hub.setting': {
    i18nKey: 'hub.capability.resource.setting',
    defaultLabel: 'Settings',
  },
};

const capabilityActionLabels: Record<string, LabelDefinition> = {
  '*': { i18nKey: 'hub.capability.action.all', defaultLabel: 'All actions' },
  create: { i18nKey: 'hub.capability.action.create', defaultLabel: 'Create' },
  read: { i18nKey: 'hub.capability.action.read', defaultLabel: 'View' },
  update: { i18nKey: 'hub.capability.action.update', defaultLabel: 'Update' },
  delete: { i18nKey: 'hub.capability.action.delete', defaultLabel: 'Delete' },
  assign: { i18nKey: 'hub.capability.action.assign', defaultLabel: 'Assign' },
  export: { i18nKey: 'hub.capability.action.export', defaultLabel: 'Export' },
  deploy: { i18nKey: 'hub.capability.action.deploy', defaultLabel: 'Deploy' },
  rollback: {
    i18nKey: 'hub.capability.action.rollback',
    defaultLabel: 'Roll back',
  },
  redeploy: {
    i18nKey: 'hub.capability.action.redeploy',
    defaultLabel: 'Redeploy',
  },
  control: {
    i18nKey: 'hub.capability.action.control',
    defaultLabel: 'Control',
  },
  rotate: { i18nKey: 'hub.capability.action.rotate', defaultLabel: 'Rotate' },
};

const auditActionLabels: Record<string, LabelDefinition> = {
  'application.created': {
    i18nKey: 'hub.audit.action.application.created',
    defaultLabel: 'Application created',
  },
  'application.updated': {
    i18nKey: 'hub.audit.action.application.updated',
    defaultLabel: 'Application updated',
  },
  'application.archived': {
    i18nKey: 'hub.audit.action.application.archived',
    defaultLabel: 'Application archived',
  },
  'application.restored': {
    i18nKey: 'hub.audit.action.application.restored',
    defaultLabel: 'Application restored',
  },
  'release.published': {
    i18nKey: 'hub.audit.action.release.published',
    defaultLabel: 'Release published',
  },
  'release.pinned': {
    i18nKey: 'hub.audit.action.release.pinned',
    defaultLabel: 'Release pinned',
  },
  'release.unpinned': {
    i18nKey: 'hub.audit.action.release.unpinned',
    defaultLabel: 'Release unpinned',
  },
  'deployment.requested': {
    i18nKey: 'hub.audit.action.deployment.requested',
    defaultLabel: 'Deployment requested',
  },
  'deployment.succeeded': {
    i18nKey: 'hub.audit.action.deployment.succeeded',
    defaultLabel: 'Deployment succeeded',
  },
  'deployment.failed': {
    i18nKey: 'hub.audit.action.deployment.failed',
    defaultLabel: 'Deployment failed',
  },
  'runtime.started': {
    i18nKey: 'hub.audit.action.runtime.started',
    defaultLabel: 'Runtime started',
  },
  'runtime.evicted': {
    i18nKey: 'hub.audit.action.runtime.evicted',
    defaultLabel: 'Application stopped',
  },
  'runtime.restarted': {
    i18nKey: 'hub.audit.action.runtime.restarted',
    defaultLabel: 'Runtime restarted',
  },
  'runtimeSecret.rotated': {
    i18nKey: 'hub.audit.action.runtimeSecret.rotated',
    defaultLabel: 'Runtime secret rotated',
  },
  'runtimeSecret.rotationFailed': {
    i18nKey: 'hub.audit.action.runtimeSecret.rotationFailed',
    defaultLabel: 'Runtime secret rotation failed',
  },
  'credential.authorized': {
    i18nKey: 'hub.audit.action.credential.authorized',
    defaultLabel: 'Agent credential authorized',
  },
  'credential.revoked': {
    i18nKey: 'hub.audit.action.credential.revoked',
    defaultLabel: 'Agent credential revoked',
  },
  'member.invited': {
    i18nKey: 'hub.audit.action.member.invited',
    defaultLabel: 'Member invited',
  },
  'member.updated': {
    i18nKey: 'hub.audit.action.member.updated',
    defaultLabel: 'Member updated',
  },
  'permission.updated': {
    i18nKey: 'hub.audit.action.permission.updated',
    defaultLabel: 'Permission updated',
  },
  'settings.updated': {
    i18nKey: 'hub.audit.action.settings.updated',
    defaultLabel: 'Settings updated',
  },
  'defaultApplication.bootstrapped': {
    i18nKey: 'hub.audit.action.defaultApplication.bootstrapped',
    defaultLabel: 'Default application initialized',
  },
  'defaultApplication.bootstrapFailed': {
    i18nKey: 'hub.audit.action.defaultApplication.bootstrapFailed',
    defaultLabel: 'Default application initialization failed',
  },
  'setup.owner.created': {
    i18nKey: 'hub.audit.action.setup.owner.created',
    defaultLabel: 'Hub Owner created',
  },
};

const auditResourceLabels: Record<string, LabelDefinition> = {
  hub: { i18nKey: 'hub.audit.resource.hub', defaultLabel: 'Hub' },
  application: {
    i18nKey: 'hub.audit.resource.application',
    defaultLabel: 'Application',
  },
  release: { i18nKey: 'hub.audit.resource.release', defaultLabel: 'Release' },
  deployment: {
    i18nKey: 'hub.audit.resource.deployment',
    defaultLabel: 'Deployment',
  },
  runtime: { i18nKey: 'hub.audit.resource.runtime', defaultLabel: 'Runtime' },
  runtimeSecret: {
    i18nKey: 'hub.audit.resource.runtimeSecret',
    defaultLabel: 'Runtime secret',
  },
  credential: {
    i18nKey: 'hub.audit.resource.credential',
    defaultLabel: 'Agent credential',
  },
  member: { i18nKey: 'hub.audit.resource.member', defaultLabel: 'Member' },
};

const auditSourceLabels: Record<string, LabelDefinition> = {
  web: { i18nKey: 'hub.audit.source.web', defaultLabel: 'Web' },
  agent: { i18nKey: 'hub.audit.source.agent', defaultLabel: 'Coding Agent' },
  system: { i18nKey: 'hub.audit.source.system', defaultLabel: 'System' },
};

const environmentLabels: Record<string, LabelDefinition> = {
  default: { i18nKey: 'hub.environment.default', defaultLabel: 'Production' },
};

type DeploymentFailureDefinition = {
  title: LabelDefinition;
  message: LabelDefinition;
};

const deploymentFailureLabels: Record<string, DeploymentFailureDefinition> = {
  READINESS_FAILED: {
    title: {
      i18nKey: 'hub.deployment.failure.readinessFailed.title',
      defaultLabel: 'Readiness failed',
    },
    message: {
      i18nKey: 'hub.deployment.failure.readinessFailed.message',
      defaultLabel: 'Runtime readiness check failed.',
    },
  },
  HUB_RESTARTED_DURING_DEPLOYMENT: {
    title: {
      i18nKey: 'hub.deployment.failure.hubRestarted.title',
      defaultLabel: 'Deployment interrupted',
    },
    message: {
      i18nKey: 'hub.deployment.failure.hubRestarted.message',
      defaultLabel:
        'Hub restarted during deployment, so the outcome could not be verified safely.',
    },
  },
  RELEASE_SERVER_ENTRYPOINT_MISSING: {
    title: {
      i18nKey: 'hub.deployment.failure.serverEntrypointMissing.title',
      defaultLabel: 'Server entry point missing',
    },
    message: {
      i18nKey: 'hub.deployment.failure.serverEntrypointMissing.message',
      defaultLabel:
        'The release does not contain a runnable server entry point.',
    },
  },
  APP_CREATE_FAILED: {
    title: {
      i18nKey: 'hub.deployment.failure.appCreateFailed.title',
      defaultLabel: 'Application start failed',
    },
    message: {
      i18nKey: 'hub.deployment.failure.appCreateFailed.message',
      defaultLabel: 'APP Host could not start the application.',
    },
  },
  INTERNAL_ERROR: {
    title: {
      i18nKey: 'hub.deployment.failure.internalError.title',
      defaultLabel: 'Internal error',
    },
    message: {
      i18nKey: 'hub.deployment.failure.internalError.message',
      defaultLabel: 'An internal error interrupted the deployment.',
    },
  },
};

type HubDeploymentFailureLabel = {
  title: string;
  message: string;
};

function resolveLabel(
  definitions: Record<string, LabelDefinition>,
  value: string,
  translate: Translate,
): string {
  const definition = definitions[value];
  return definition
    ? translate(definition.i18nKey, definition.defaultLabel)
    : humanize(value);
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

export function getHubRoleLabel(value: string, translate: Translate): string {
  return resolveLabel(roleLabels, value.toLowerCase(), translate);
}

export function getHubRoleScopeLabel(
  value: string,
  translate: Translate,
): string {
  return resolveLabel(roleScopeLabels, value, translate);
}

export function getHubCapabilityResourceLabel(
  value: string,
  translate: Translate,
): string {
  return resolveLabel(capabilityResourceLabels, value, translate);
}

export function getHubCapabilityActionLabel(
  value: string,
  translate: Translate,
): string {
  return resolveLabel(capabilityActionLabels, value, translate);
}

export function getHubAuditActionLabel(
  value: string,
  translate: Translate,
): string {
  return resolveLabel(auditActionLabels, value, translate);
}

export function getHubAuditResourceLabel(
  value: string,
  translate: Translate,
): string {
  return resolveLabel(auditResourceLabels, value, translate);
}

export function getHubAuditSourceLabel(
  value: string,
  translate: Translate,
): string {
  return resolveLabel(auditSourceLabels, value, translate);
}

export function getHubEnvironmentLabel(
  value: string,
  translate: Translate,
): string {
  return resolveLabel(environmentLabels, value, translate);
}

export function getHubDeploymentFailureLabel(
  code: string,
  message: string,
  translate: Translate,
): HubDeploymentFailureLabel {
  const definition = deploymentFailureLabels[code];
  if (definition) {
    const isSimplifiedChinese =
      translate('locale.zh-CN', 'Simplified Chinese') === '简体中文';
    return {
      title: translate(definition.title.i18nKey, definition.title.defaultLabel),
      message: isSimplifiedChinese
        ? translate(definition.message.i18nKey, definition.message.defaultLabel)
        : message,
    };
  }

  if (translate('locale.zh-CN', 'Simplified Chinese') !== '简体中文') {
    return { title: humanize(code), message };
  }

  return {
    title: translate(
      'hub.deployment.failure.unknown.title',
      'Deployment failed',
    ),
    message: translate('hub.deployment.failure.default', 'Deployment failed.'),
  };
}
