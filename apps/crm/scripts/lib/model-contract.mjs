import fs from 'node:fs';
import path from 'node:path';
import { unwrapData } from './nb-cli.mjs';

export function loadModelContract(appRoot) {
  const modelRoot = path.join(appRoot, 'nocobase/model');
  const collectionFiles = listJsonFiles(path.join(modelRoot, 'collections'));
  const relationFiles = listJsonFiles(path.join(modelRoot, 'relations'));
  return {
    collectionFiles,
    relationFiles,
    collectionSpecs: collectionFiles.map(readJson),
    relationSpecs: relationFiles.map(readJson),
  };
}

export function readCollection(runNb, name) {
  return unwrapData(
    runNb([
      'api',
      'data-modeling',
      'collections',
      'get',
      '--filter-by-tk',
      name,
      '--appends',
      'fields',
    ]),
  );
}

export function findField(collection, name) {
  const fields = Array.isArray(collection?.fields) ? collection.fields : [];
  return fields.find((field) => field.name === name);
}

export function fieldMatches(actual, expected) {
  if (!actual) return false;
  for (const key of ['interface', 'target', 'foreignKey', 'targetKey']) {
    if (expected[key] !== undefined && actual[key] !== expected[key])
      return false;
  }
  if (
    expected.title !== undefined &&
    actual.uiSchema?.title !== expected.title
  ) {
    return false;
  }
  if (
    expected.targetTitleField !== undefined &&
    actual.uiSchema?.['x-component-props']?.fieldNames?.label !==
      expected.targetTitleField
  ) {
    return false;
  }
  const actualValidators = new Set(
    Array.isArray(actual.validation?.rules)
      ? actual.validation.rules.map((rule) => rule.name)
      : [],
  );
  const expectedValidators = Array.isArray(expected.validators)
    ? expected.validators.map((validator) =>
        typeof validator === 'string' ? validator : validator.name,
      )
    : [];
  return expectedValidators.every((name) => actualValidators.has(name));
}

export function expectedReverseField(spec) {
  return {
    ...spec.reverseField,
    target: spec.reverseField?.target ?? spec.collectionName,
    foreignKey: spec.reverseField?.foreignKey ?? spec.foreignKey,
    targetKey: spec.reverseField?.targetKey ?? spec.targetKey,
  };
}

export function inspectRelation(runNb, spec) {
  const sourceCollection = readCollection(runNb, spec.collectionName);
  const sourceField = findField(sourceCollection, spec.name);
  const reverseCollection = spec.reverseField
    ? readCollection(runNb, spec.target)
    : undefined;
  const reverseField = spec.reverseField
    ? findField(reverseCollection, spec.reverseField.name)
    : undefined;
  return { sourceField, reverseField };
}

export function relationMatches(spec, state) {
  return (
    fieldMatches(state.sourceField, spec) &&
    (!spec.reverseField ||
      fieldMatches(state.reverseField, expectedReverseField(spec)))
  );
}

export function buildRelationPayload(spec, state) {
  if (!spec.reverseField || !state.reverseField?.key) return spec;
  return {
    ...spec,
    reverseField: {
      ...spec.reverseField,
      key: state.reverseField.key,
    },
  };
}

export function verifyLiveModelContract(runNb, contract) {
  const collections = new Map();

  for (const spec of contract.collectionSpecs) {
    const collection = readCollection(runNb, spec.name);
    if (!collection || collection.name !== spec.name) {
      throw new Error(`Readback did not resolve collection ${spec.name}`);
    }
    if (collection.template !== spec.template) {
      throw new Error(
        `${spec.name} template is ${collection.template}, expected ${spec.template}`,
      );
    }
    for (const expected of spec.fields) {
      const actual = findField(collection, expected.name);
      if (!fieldMatches(actual, expected)) {
        throw new Error(
          `${spec.name}.${expected.name} readback does not match the model contract`,
        );
      }
    }
    collections.set(spec.name, collection);
  }

  for (const spec of contract.relationSpecs) {
    const sourceCollection = collections.get(spec.collectionName);
    const reverseCollection = spec.reverseField
      ? collections.get(spec.target)
      : undefined;
    const state = {
      sourceField: findField(sourceCollection, spec.name),
      reverseField: spec.reverseField
        ? findField(reverseCollection, spec.reverseField.name)
        : undefined,
    };
    if (!relationMatches(spec, state)) {
      throw new Error(
        `${spec.collectionName}.${spec.name} relation readback does not match the model contract`,
      );
    }
  }

  return collections;
}

function listJsonFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
