import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  crmResources,
  getResourceAppends,
  type CrmFieldConfig,
} from '@/features/crm/resource-config';

const modelRoot = path.join(process.cwd(), 'nocobase/model');

const readSpecs = (directory: string) =>
  fs
    .readdirSync(path.join(modelRoot, directory))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) =>
      JSON.parse(
        fs.readFileSync(path.join(modelRoot, directory, file), 'utf8'),
      ),
    ) as Array<Record<string, unknown>>;

const collectionSpecs = readSpecs('collections');
const relationSpecs = readSpecs('relations');

const resolveRelation = (collectionName: string, name: string) => {
  for (const relation of relationSpecs) {
    if (relation.collectionName === collectionName && relation.name === name) {
      return relation;
    }
    const reverseField = relation.reverseField as
      Record<string, unknown> | undefined;
    if (relation.target === collectionName && reverseField?.name === name) {
      return {
        ...reverseField,
        collectionName,
        foreignKey: relation.foreignKey,
        target: relation.collectionName,
        targetKey: relation.targetKey,
      };
    }
  }
};

describe('CRM frontend and NocoBase model contract', () => {
  it('defines exactly one model collection for every CRM resource', () => {
    expect(collectionSpecs.map((spec) => spec.name).sort()).toEqual(
      Object.keys(crmResources).sort(),
    );
  });

  it('keeps scalar fields, relations, foreign keys, and enum values aligned', () => {
    for (const config of Object.values(crmResources)) {
      const collection = collectionSpecs.find(
        (spec) => spec.name === config.resource,
      );
      expect(collection).toBeDefined();
      expect(collection?.template).toBe('general');
      const scalarFields = (collection?.fields ?? []) as Array<
        Record<string, unknown>
      >;

      if (config.resource === 'agent_crm_leads') {
        const leadNumber = scalarFields.find((field) => field.name === 'code');
        expect(leadNumber?.interface).toBe('sequence');
        expect(leadNumber?.patterns).toEqual(expect.any(Array));
      }

      for (const field of config.fields) {
        if (field.relation) {
          const relation = resolveRelation(
            config.resource,
            field.relation.relationName,
          );
          expect(relation, `${config.resource}.${field.name}`).toBeDefined();
          expect(relation?.foreignKey).toBe(field.name);
          expect(relation?.target).toBe(field.relation.resource);
          continue;
        }

        const modelField = scalarFields.find(
          (candidate) => candidate.name === field.name,
        );
        expect(modelField, `${config.resource}.${field.name}`).toBeDefined();
        if (field.options) {
          const modelOptions = (modelField?.enum ?? []) as Array<{
            value: string;
          }>;
          expect(modelOptions.map((option) => option.value)).toEqual(
            field.options.map((option) => option.value),
          );
        }
      }
    }
  });

  it('requests every configured relation through NocoBase appends', () => {
    for (const config of Object.values(crmResources)) {
      const relationNames = config.fields
        .filter(
          (
            field,
          ): field is CrmFieldConfig & {
            relation: NonNullable<CrmFieldConfig['relation']>;
          } => Boolean(field.relation),
        )
        .map((field) => field.relation.relationName);
      expect(getResourceAppends(config)).toEqual(relationNames);
      expect(new Set(relationNames).size).toBe(relationNames.length);
    }
  });

  it('gives every generated reverse relation a stable target and readable label', () => {
    for (const relation of relationSpecs) {
      const reverseField = relation.reverseField as
        Record<string, unknown> | undefined;
      if (!reverseField) continue;
      expect(reverseField.target).toBe(relation.collectionName);
      expect(reverseField.targetTitleField).toEqual(expect.any(String));
      expect(reverseField.targetTitleField).not.toBe('id');
    }
  });
});
