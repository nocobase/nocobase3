import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNbRunner } from './lib/nb-cli.mjs';
import {
  buildRelationPayload,
  expectedReverseField,
  fieldMatches,
  inspectRelation as inspectModelRelation,
  loadModelContract,
  readCollection as readModelCollection,
  relationMatches,
} from './lib/model-contract.mjs';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const rawArgs = process.argv.slice(2);

const readFlagValue = (name, shortName) => {
  const equals = rawArgs.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = rawArgs.findIndex((arg) => arg === name || arg === shortName);
  return index >= 0 ? rawArgs[index + 1] : undefined;
};

const targetEnv = readFlagValue('--env', '-e');
const planOnly = rawArgs.includes('--plan');
const confirmCrossEnv = rawArgs.includes('--yes') || rawArgs.includes('-y');
const verifyIdempotent = rawArgs.includes('--verify-idempotent');

if (!targetEnv) {
  console.error(
    'Target env is required. Usage: pnpm model:apply -- --env <name> [--yes] [--plan] [--verify-idempotent]',
  );
  process.exit(2);
}

const modelContract = loadModelContract(appRoot);
const { collectionFiles, relationFiles, collectionSpecs, relationSpecs } =
  modelContract;
const readSpec = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const runNb = createNbRunner({ cwd: appRoot, targetEnv, confirmCrossEnv });
const readCollection = (name) => readModelCollection(runNb, name);
const inspectRelation = (spec) => inspectModelRelation(runNb, spec);

const findBooleanFlag = (value, key) => {
  if (!value || typeof value !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  for (const child of Object.values(value)) {
    const found = findBooleanFlag(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
};

const applyModel = (label) => {
  console.log(`\n${label}`);
  const results = [];
  for (const file of collectionFiles) {
    const spec = readSpec(file);
    const payload = runNb([
      'api',
      'data-modeling',
      'collections',
      'apply',
      '--body-file',
      file,
    ]);
    results.push({ kind: 'collection', name: spec.name, payload });
    console.log(`  collection ${spec.name}: applied`);
  }
  for (const file of relationFiles) {
    const spec = readSpec(file);
    const state = inspectRelation(spec);
    if (relationMatches(spec, state)) {
      results.push({
        kind: 'relation',
        name: `${spec.collectionName}.${spec.name}`,
        payload: { changed: false, converged: true },
      });
      console.log(`  relation ${spec.collectionName}.${spec.name}: converged`);
      continue;
    }
    const body = JSON.stringify(buildRelationPayload(spec, state));
    const payload = runNb([
      'api',
      'data-modeling',
      'fields',
      'apply',
      '--body',
      body,
    ]);
    results.push({
      kind: 'relation',
      name: `${spec.collectionName}.${spec.name}`,
      payload,
    });
    console.log(`  relation ${spec.collectionName}.${spec.name}: applied`);
  }
  return results;
};

const verifyCollection = (spec) => {
  const collection = readCollection(spec.name);
  if (!collection || collection.name !== spec.name) {
    throw new Error(`Readback did not resolve collection ${spec.name}`);
  }
  if (collection.template !== spec.template) {
    throw new Error(
      `${spec.name} template is ${collection.template}, expected ${spec.template}`,
    );
  }
  const fields = Array.isArray(collection.fields) ? collection.fields : [];
  const expectedFields = [
    ...spec.fields,
    ...relationSpecs.filter(
      (relation) => relation.collectionName === spec.name,
    ),
  ];
  for (const expected of expectedFields) {
    const actual = fields.find((field) => field.name === expected.name);
    if (!actual) throw new Error(`${spec.name}.${expected.name} is missing`);
    if (actual.interface !== expected.interface) {
      throw new Error(
        `${spec.name}.${expected.name} interface is ${actual.interface}, expected ${expected.interface}`,
      );
    }
    if (expected.foreignKey && actual.foreignKey !== expected.foreignKey) {
      throw new Error(
        `${spec.name}.${expected.name} foreignKey is ${actual.foreignKey}, expected ${expected.foreignKey}`,
      );
    }
  }
  console.log(
    `  ${spec.name}: ${expectedFields.length} business fields verified`,
  );
};

const verifyRelation = (spec) => {
  const state = inspectRelation(spec);
  if (!fieldMatches(state.sourceField, spec)) {
    throw new Error(
      `${spec.collectionName}.${spec.name} readback does not match`,
    );
  }
  if (
    spec.reverseField &&
    !fieldMatches(state.reverseField, expectedReverseField(spec))
  ) {
    throw new Error(
      `${spec.target}.${spec.reverseField.name} reverse readback does not match`,
    );
  }
  console.log(`  ${spec.collectionName}.${spec.name}: relation verified`);
};

console.log(`CRM model target: ${targetEnv}`);
console.log(
  `Collections: ${collectionSpecs.map((spec) => spec.name).join(', ')}`,
);
console.log(`Relations: ${relationSpecs.length}`);

if (planOnly) {
  console.log('Plan only: no NocoBase state was changed.');
  process.exit(0);
}

applyModel('Apply desired model');

if (verifyIdempotent) {
  const secondPass = applyModel('Verify converged second pass');
  const changed = secondPass.filter(
    (result) => findBooleanFlag(result.payload, 'changed') === true,
  );
  if (changed.length > 0) {
    throw new Error(
      `Second pass still reported changes: ${changed.map((item) => item.name).join(', ')}`,
    );
  }
  console.log('  second pass completed without reported changes');
}

console.log('\nRead back model');
for (const spec of collectionSpecs) verifyCollection(spec);
for (const spec of relationSpecs) verifyRelation(spec);
console.log('\nCRM data model is ready.');
