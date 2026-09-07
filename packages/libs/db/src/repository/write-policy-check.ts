import { RepositoryError } from './errors.js';
import type {
  RelationMutationAst,
  RepositoryRecord,
  RelationUpsertTarget,
  CreateTarget,
  RelationUpdateTarget,
} from './types.js';
import {
  relationWriteOperations,
  type FieldWritePolicy,
  type WritePolicy,
  type ThroughWritePolicy,
  type RelationWriteOperation,
  type RelationWritePolicy,
  type PolicyPath,
} from './write-policy.js';

export function assertFieldWrites(
  values: Readonly<Record<string, unknown>>,
  policy: true | FieldWritePolicy,
  path: PolicyPath,
  relationPath: readonly string[] = [],
  operation?: string,
  collection?: string,
): void {
  if (policy === true) return;
  const allowedFields = policy.fields || [];
  for (const field of Object.keys(values)) {
    if (!allowedFields.includes(field))
      throw new RepositoryError(
        'FIELD_WRITE_FORBIDDEN',
        `Writing field "${field}" is not allowed.`,
        {
          collection,
          field,
          path: [...path, field],
          details: { relationPath, operation, field, allowedFields },
        },
      );
  }
}

/** Normalized values contain only caller-supplied fields; adapters add managed values later. */
export function assertMutationWritePolicy(
  mutation: {
    readonly values: Readonly<Record<string, unknown>>;
    readonly relations?: RelationMutationAst;
  },
  policy: true | WritePolicy,
  path: PolicyPath = ['values'],
  relationPath: readonly string[] = [],
  operation = 'update',
  collection?: string,
): void {
  if (policy === true) return;
  assertFieldWrites(
    mutation.values,
    policy,
    path,
    relationPath,
    operation,
    collection,
  );
  for (const node of mutation.relations?.items ?? []) {
    const rules = policy.relations;
    const rule =
      rules && Object.hasOwn(rules, node.field) ? rules[node.field] : undefined;
    const relations = [...relationPath, node.field];
    const fieldPath = [...path, node.field];
    const requireOperation = <T extends RelationWriteOperation>(
      op: T,
    ): NonNullable<RelationWritePolicy[T]> => {
      const config = rule?.[op];
      if (config === undefined)
        throw new RepositoryError(
          'RELATION_WRITE_FORBIDDEN',
          `Relation operation "${op}" is not allowed for "${relations.join('.')}".`,
          {
            collection: mutation.relations?.collection,
            relation: node.field,
            path: [...fieldPath, op],
            details: {
              relationPath: relations,
              operation: op,
              allowedOperations: relationWriteOperations.filter(
                (key) => rule?.[key] !== undefined,
              ),
            },
          },
        );
      return config;
    };
    const through = (
      target: { readonly through?: RepositoryRecord },
      config: ThroughWritePolicy,
      targetPath: PolicyPath,
      op: string,
    ): void => {
      if (target.through === undefined) return;
      if (!config.through)
        throw new RepositoryError(
          'FIELD_WRITE_FORBIDDEN',
          'Through payload is not allowed.',
          {
            path: [...targetPath, 'through'],
            relation: node.field,
            details: {
              relationPath: relations,
              operation: op,
              allowedFields: [],
            },
          },
        );
      assertFieldWrites(
        target.through,
        config.through,
        [...targetPath, 'through'],
        relations,
        op,
      );
    };
    const create = (target: CreateTarget, targetPath: PolicyPath): void => {
      const config = requireOperation('create');
      through(target, config, targetPath, 'create');
      assertMutationWritePolicy(
        target,
        config,
        [...targetPath, 'values'],
        relations,
        'create',
      );
    };
    const update = (
      target: RelationUpdateTarget,
      targetPath: PolicyPath,
    ): void => {
      const config = requireOperation('update');
      assertMutationWritePolicy(
        target,
        config,
        [...targetPath, 'values'],
        relations,
        'update',
      );
    };
    const upsert = (
      target: RelationUpsertTarget,
      targetPath: PolicyPath,
    ): void => {
      const config = requireOperation('upsert');
      assertMutationWritePolicy(
        target.create,
        config.create,
        [...targetPath, 'create'],
        relations,
        'create',
      );
      assertMutationWritePolicy(
        target.update,
        config.update,
        [...targetPath, 'update'],
        relations,
        'update',
      );
    };
    if (node.action === 'set') {
      if (node.target.kind === 'create')
        create(node.target, [...fieldPath, 'create']);
      else
        through(
          node.target,
          requireOperation('connect'),
          [...fieldPath, 'connect'],
          'connect',
        );
    } else if (node.action === 'clear') {
      requireOperation('disconnect');
    } else if (node.action === 'replace') {
      const config = requireOperation('set');
      node.targets.forEach((target, index) =>
        through(target, config, [...fieldPath, 'set', index], 'set'),
      );
    } else if (node.action === 'patch') {
      node.connect?.forEach((target, index) =>
        through(
          target,
          requireOperation('connect'),
          [...fieldPath, 'connect', index],
          'connect',
        ),
      );
      if (node.disconnect?.length) requireOperation('disconnect');
      if (node.delete?.length) requireOperation('delete');
      node.create?.forEach((target, index) =>
        create(target, [...fieldPath, 'create', index]),
      );
      node.update?.forEach((target, index) =>
        update(target, [...fieldPath, 'update', index]),
      );
      node.upsert?.forEach((target, index) =>
        upsert(target, [...fieldPath, 'upsert', index]),
      );
    } else {
      if (node.delete) requireOperation('delete');
      if (node.update) update(node.update, [...fieldPath, 'update']);
      if (node.upsert) upsert(node.upsert, [...fieldPath, 'upsert']);
    }
  }
}
