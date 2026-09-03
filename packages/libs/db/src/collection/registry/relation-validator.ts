import type {
  AnyFieldDefinition,
  CollectionDefinition,
  RelationFieldDefinition,
} from '../types.js';

export interface CollectionRelationValidationIssue {
  readonly code: 'COLLECTION_RELATION_INVALID';
  readonly collection: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export class CollectionRelationValidationError extends Error {
  readonly code = 'COLLECTION_RELATION_VALIDATION_FAILED' as const;

  constructor(readonly issues: readonly CollectionRelationValidationIssue[]) {
    super(
      `Collection relation validation failed with ${issues.length} issue(s).`,
    );
    this.name = 'CollectionRelationValidationError';
  }
}

export interface CollectionRelationProvider {
  get(name: string): Promise<CollectionDefinition | undefined>;
  scan(): AsyncIterable<CollectionDefinition>;
}

export class CollectionRelationValidator {
  constructor(private readonly provider: CollectionRelationProvider) {}

  async validateCollection(collection: CollectionDefinition): Promise<void> {
    const issues: CollectionRelationValidationIssue[] = [];
    await this.validateOne(collection, issues);
    if (issues.length > 0) throw new CollectionRelationValidationError(issues);
  }

  async validateGraph(name?: string): Promise<void> {
    const issues: CollectionRelationValidationIssue[] = [];
    const visited = new Set<string>();
    const visit = async (collection: CollectionDefinition): Promise<void> => {
      const collectionName = collection.name;
      if (!collectionName || visited.has(collectionName)) return;
      visited.add(collectionName);
      await this.validateOne(collection, issues);
      for (const relation of relations(collection.fields)) {
        const target = await this.provider.get(relation.target);
        if (target) await visit(target);
        if (relation.through) {
          const through = await this.provider.get(relation.through);
          if (through) await visit(through);
        }
      }
    };

    if (name) {
      const collection = await this.provider.get(name);
      if (collection) await visit(collection);
    } else {
      for await (const collection of this.provider.scan())
        await visit(collection);
    }
    if (issues.length > 0) throw new CollectionRelationValidationError(issues);
  }

  private async validateOne(
    collection: CollectionDefinition,
    issues: CollectionRelationValidationIssue[],
  ): Promise<void> {
    const collectionName = collection.name ?? '<unknown>';
    for (const relation of relations(collection.fields)) {
      const path = ['relations', relation.name] as const;
      const target = await this.provider.get(relation.target);
      if (!target) {
        issues.push(
          issue(
            collectionName,
            [...path, 'target'],
            `Relation target Collection "${relation.target}" does not exist.`,
          ),
        );
        continue;
      }
      const sourceKey =
        relation.type === 'belongsTo'
          ? relation.sourceKey
          : (relation.sourceKey ?? 'id');
      if (sourceKey && !scalarField(collection.fields, sourceKey)) {
        issues.push(
          issue(
            collectionName,
            [...path, 'sourceKey'],
            `Relation sourceKey "${sourceKey}" does not exist on Collection "${collectionName}".`,
          ),
        );
      }
      const targetKey =
        relation.type === 'belongsTo' || relation.type === 'belongsToMany'
          ? (relation.targetKey ?? 'id')
          : relation.targetKey;
      if (targetKey && !scalarField(target.fields, targetKey)) {
        issues.push(
          issue(
            collectionName,
            [...path, 'targetKey'],
            `Relation targetKey "${targetKey}" does not exist on Collection "${relation.target}".`,
          ),
        );
      }
      if (
        (relation.type === 'hasOne' || relation.type === 'hasMany') &&
        relation.foreignKey &&
        !scalarField(target.fields, relation.foreignKey)
      ) {
        issues.push(
          issue(
            collectionName,
            [...path, 'foreignKey'],
            `Relation foreignKey "${relation.foreignKey}" does not exist on target Collection "${relation.target}".`,
          ),
        );
      }
      if (relation.type === 'belongsToMany' && relation.through) {
        const through = await this.provider.get(relation.through);
        if (!through) {
          issues.push(
            issue(
              collectionName,
              [...path, 'through'],
              `Relation through Collection "${relation.through}" does not exist.`,
            ),
          );
        } else {
          for (const [property, field] of [
            ['foreignKey', relation.foreignKey],
            ['otherKey', relation.otherKey],
          ] as const) {
            if (field && !scalarField(through.fields, field)) {
              issues.push(
                issue(
                  collectionName,
                  [...path, property],
                  `Relation ${property} "${field}" does not exist on through Collection "${relation.through}".`,
                ),
              );
            }
          }
        }
      }
    }
  }
}

function relations(
  fields: AnyFieldDefinition[] | undefined,
): RelationFieldDefinition[] {
  return (fields ?? []).filter(
    (field): field is RelationFieldDefinition =>
      field.type === 'belongsTo' ||
      field.type === 'hasOne' ||
      field.type === 'hasMany' ||
      field.type === 'belongsToMany',
  );
}

function scalarField(
  fields: AnyFieldDefinition[] | undefined,
  name: string,
): boolean {
  return Boolean(
    (fields ?? []).find(
      (field) => field.name === name && !relations([field]).length,
    ),
  );
}

function issue(
  collection: string,
  path: readonly (string | number)[],
  message: string,
): CollectionRelationValidationIssue {
  return { code: 'COLLECTION_RELATION_INVALID', collection, path, message };
}
