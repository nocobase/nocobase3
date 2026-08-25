import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadAclPolicy, verifyLiveAclContract } from './acl-contract.mjs';
import {
  loadModelContract,
  verifyLiveModelContract,
} from './model-contract.mjs';
import { createNbRunner, normalizeApiBaseUrl } from './nb-cli.mjs';

export function createReleaseContract(appRoot) {
  const resolvedAppRoot = path.resolve(appRoot);
  const config = readJson(
    path.join(resolvedAppRoot, 'app-release.config.json'),
  );
  const model = loadModelContract(resolvedAppRoot);
  const acl = loadAclPolicy(
    resolvedAppRoot,
    config.aclPolicy ?? 'nocobase/acl/policy.json',
  );
  const requiredCollections = normalizeRequiredCollections(
    config.requiredCollections,
  );
  const modelCollectionNames = model.collectionSpecs.map(
    (collection) => collection.name,
  );
  assertStringSetEqual(
    modelCollectionNames,
    requiredCollections,
    'release/model collection names',
  );
  if (acl.dataSourceKey !== (config.dataSourceKey ?? 'main')) {
    throw new Error(
      `ACL data source ${acl.dataSourceKey} does not match release data source ${config.dataSourceKey ?? 'main'}`,
    );
  }
  for (const role of acl.roles) {
    assertStringSetEqual(
      role.resources.map((resource) => resource.name),
      requiredCollections,
      `${role.name} ACL resource names`,
    );
  }

  const contract = {
    schemaVersion: 1,
    dataSourceKey: acl.dataSourceKey,
    model: {
      collections: model.collectionSpecs,
      relations: model.relationSpecs,
    },
    acl,
  };
  return {
    contract,
    contractSha256: sha256(stableJson(contract)),
    model,
    acl,
  };
}

export function verifyReleaseContract({
  appRoot,
  targetEnv,
  apiBaseUrl,
  confirmCrossEnv = false,
  runNb,
}) {
  if (typeof targetEnv !== 'string' || !targetEnv.trim()) {
    throw new Error('Target env is required for the release contract gate');
  }
  const prepared = createReleaseContract(appRoot);
  const normalizedApiBaseUrl = apiBaseUrl
    ? normalizeApiBaseUrl(apiBaseUrl)
    : undefined;
  const runner =
    runNb ??
    createNbRunner({
      cwd: path.resolve(appRoot),
      targetEnv: targetEnv.trim(),
      apiBaseUrl: normalizedApiBaseUrl,
      confirmCrossEnv,
    });
  const collections = verifyLiveModelContract(runner, prepared.model);
  const roles = verifyLiveAclContract(runner, prepared.acl, collections);
  return {
    schemaVersion: 1,
    env: targetEnv.trim(),
    apiBaseUrl: normalizedApiBaseUrl,
    contractSha256: prepared.contractSha256,
    collections: [...collections.values()].map((collection) => ({
      name: collection.name,
      fields: Array.isArray(collection.fields) ? collection.fields.length : 0,
    })),
    roles,
  };
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function normalizeRequiredCollections(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      'app-release.config.json requiredCollections must be a non-empty array',
    );
  }
  const collections = value.map((item) => {
    if (
      typeof item !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(item)
    ) {
      throw new Error('required collection must be a safe path segment');
    }
    return item;
  });
  if (new Set(collections).size !== collections.length) {
    throw new Error(
      'app-release.config.json requiredCollections must not contain duplicates',
    );
  }
  return collections;
}

function assertStringSetEqual(actual, expected, label) {
  const actualValues = [...actual].sort((left, right) =>
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

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
