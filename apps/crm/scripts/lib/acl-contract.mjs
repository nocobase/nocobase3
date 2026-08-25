import fs from 'node:fs';
import path from 'node:path';
import { unwrapData } from './nb-cli.mjs';

const supportedScopes = new Set(['none', 'all', 'own']);

export function loadAclPolicy(
  appRoot,
  relativePath = 'nocobase/acl/policy.json',
) {
  const policyPath = path.resolve(appRoot, relativePath);
  const relative = path.relative(path.resolve(appRoot), policyPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('ACL policy path must stay inside the app root');
  }
  return normalizeAclPolicy(JSON.parse(fs.readFileSync(policyPath, 'utf8')));
}

export function normalizeAclPolicy(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('CRM ACL policy must be an object with schemaVersion 1');
  }
  const dataSourceKey = requireSafeSegment(
    value.dataSourceKey,
    'ACL data source key',
  );
  if (!Array.isArray(value.roles) || value.roles.length === 0) {
    throw new Error('CRM ACL policy must define at least one role');
  }

  const roles = value.roles.map(normalizeRole);
  assertUnique(
    roles.map((role) => role.name),
    'ACL role names',
  );
  return { schemaVersion: 1, dataSourceKey, roles };
}

export function verifyLiveAclContract(runNb, policy, collections) {
  const normalized = normalizeAclPolicy(policy);
  const verifiedRoles = [];

  for (const expectedRole of normalized.roles) {
    const actualRole = unwrapData(
      runNb([
        'api',
        'acl',
        'roles',
        'get',
        '--filter-by-tk',
        expectedRole.name,
      ]),
    );
    verifyRoleMetadata(actualRole, expectedRole);

    const dataSourceRole = unwrapData(
      runNb([
        'api',
        'acl',
        'data-sources',
        'roles',
        'get',
        '--data-source-key',
        normalized.dataSourceKey,
        '--filter-by-tk',
        expectedRole.name,
      ]),
    );
    assertStringSetEqual(
      dataSourceRole?.strategy?.actions,
      expectedRole.globalActions,
      `${expectedRole.name} global actions`,
    );

    for (const expectedResource of expectedRole.resources) {
      const collection = collections.get(expectedResource.name);
      if (!collection) {
        throw new Error(
          `${expectedRole.name}.${expectedResource.name} has no verified model collection`,
        );
      }
      const resource = unwrapData(
        runNb([
          'api',
          'acl',
          'roles',
          'data-source-resources',
          'get',
          '--role-name',
          expectedRole.name,
          '--data-source-key',
          normalized.dataSourceKey,
          '--name',
          expectedResource.name,
          '--appends',
          'actions',
          '--appends',
          'actions.scope',
        ]),
      );
      verifyResource(resource, expectedRole.name, expectedResource, collection);
    }

    verifiedRoles.push({
      name: expectedRole.name,
      resources: expectedRole.resources.length,
      actions: expectedRole.resources.reduce(
        (count, resource) => count + resource.actions.length,
        0,
      ),
    });
  }

  return verifiedRoles;
}

function normalizeRole(value, index) {
  if (!isRecord(value)) {
    throw new Error(`ACL role at index ${index} must be an object`);
  }
  const name = requireSafeSegment(
    value.name,
    `ACL role at index ${index} name`,
  );
  const title = requireText(value.title, `${name} title`);
  const description = requireText(value.description, `${name} description`);
  const allowConfigure = requireBoolean(
    value.allowConfigure,
    `${name} allowConfigure`,
  );
  const allowNewMenu = requireBoolean(
    value.allowNewMenu,
    `${name} allowNewMenu`,
  );
  const snippets = requireStringArray(value.snippets, `${name} snippets`);
  const globalActions = requireStringArray(
    value.globalActions,
    `${name} globalActions`,
  );
  if (!Array.isArray(value.resources) || value.resources.length === 0) {
    throw new Error(`${name} must define at least one ACL resource`);
  }
  const resources = value.resources.map((resource, resourceIndex) =>
    normalizeResource(resource, name, resourceIndex),
  );
  assertUnique(
    resources.map((resource) => resource.name),
    `${name} ACL resource names`,
  );
  return {
    name,
    title,
    description,
    allowConfigure,
    allowNewMenu,
    snippets,
    globalActions,
    resources,
  };
}

function normalizeResource(value, roleName, index) {
  if (!isRecord(value)) {
    throw new Error(
      `${roleName} ACL resource at index ${index} must be an object`,
    );
  }
  const name = requireSafeSegment(value.name, `${roleName} resource name`);
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    throw new Error(`${roleName}.${name} must define at least one action`);
  }
  const actions = value.actions.map((action, actionIndex) =>
    normalizeAction(
      action,
      `${roleName}.${name} action at index ${actionIndex}`,
    ),
  );
  assertUnique(
    actions.map((action) => action.name),
    `${roleName}.${name} action names`,
  );
  return { name, actions };
}

function normalizeAction(value, label) {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  const name = requireSafeSegment(value.name, `${label} name`);
  const scope = requireText(value.scope, `${label} scope`);
  if (!supportedScopes.has(scope)) {
    throw new Error(`${label} scope must be one of none, all, own`);
  }
  if (value.fieldPolicy !== 'all') {
    throw new Error(`${label} fieldPolicy must be all`);
  }
  return { name, scope, fieldPolicy: 'all' };
}

function verifyRoleMetadata(actual, expected) {
  if (!isRecord(actual) || actual.name !== expected.name) {
    throw new Error(`ACL role ${expected.name} is missing`);
  }
  for (const key of [
    'title',
    'description',
    'allowConfigure',
    'allowNewMenu',
  ]) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `${expected.name}.${key} does not match the ACL contract`,
      );
    }
  }
  assertStringSetEqual(
    actual.snippets,
    expected.snippets,
    `${expected.name} snippets`,
  );
  assertStringSetEqual(
    actual.strategy?.actions,
    [],
    `${expected.name} role strategy actions`,
  );
}

function verifyResource(actual, roleName, expected, collection) {
  if (!isRecord(actual) || actual.name !== expected.name) {
    throw new Error(`${roleName}.${expected.name} ACL resource is missing`);
  }
  if (actual.usingActionsConfig !== true) {
    throw new Error(
      `${roleName}.${expected.name} must use independent action configuration`,
    );
  }
  const actions = Array.isArray(actual.actions) ? actual.actions : [];
  assertStringSetEqual(
    actions.map((action) => action?.name),
    expected.actions.map((action) => action.name),
    `${roleName}.${expected.name} actions`,
  );

  const expectedFields = Array.isArray(collection.fields)
    ? collection.fields
        .map((field) => field?.name)
        .filter((name) => typeof name === 'string')
    : [];
  if (expectedFields.length === 0) {
    throw new Error(
      `${roleName}.${expected.name} cannot resolve collection fields`,
    );
  }

  for (const expectedAction of expected.actions) {
    const actualAction = actions.find(
      (action) => action?.name === expectedAction.name,
    );
    if (!actualAction) {
      throw new Error(
        `${roleName}.${expected.name}.${expectedAction.name} is missing`,
      );
    }
    const actualScope =
      actualAction.scope?.key ??
      (actualAction.scopeId == null ? 'none' : undefined);
    if (actualScope !== expectedAction.scope) {
      throw new Error(
        `${roleName}.${expected.name}.${expectedAction.name} scope is ${actualScope ?? 'unresolved'}, expected ${expectedAction.scope}`,
      );
    }
    assertStringSetEqual(
      actualAction.fields,
      expectedFields,
      `${roleName}.${expected.name}.${expectedAction.name} fields`,
    );
  }
}

function assertStringSetEqual(actual, expected, label) {
  const actualValues = requireStringArray(actual, label).sort((left, right) =>
    left.localeCompare(right),
  );
  const expectedValues = [...expected].sort((left, right) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) {
    throw new Error(
      `${label} are [${actualValues.join(', ')}], expected [${expectedValues.join(', ')}]`,
    );
  }
}

function requireStringArray(value, label) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  const items = value.map((item) => item.trim());
  assertUnique(items, label);
  return items;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function requireSafeSegment(value, label) {
  const segment = requireText(value, label);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(segment) ||
    segment === '.' ||
    segment === '..'
  ) {
    throw new Error(`${label} must be a safe path segment`);
  }
  return segment;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
