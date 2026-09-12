import type { RelationFieldDefinition, RelationType } from './types.js';

export type RelationKeyOption =
  'sourceKey' | 'targetKey' | 'foreignKey' | 'otherKey' | 'through';

export class RelationConfigurationError extends Error {
  readonly code = 'COLLECTION_RELATION_INVALID' as const;
  readonly path: readonly string[];

  constructor(
    readonly relation: string,
    readonly option: RelationKeyOption,
  ) {
    super(`Relation "${relation}" requires an explicit ${option}.`);
    this.name = 'RelationConfigurationError';
    this.path = ['relations', relation, option];
  }
}

export function requiredRelationOptions(
  type: RelationType,
): readonly RelationKeyOption[] {
  switch (type) {
    case 'belongsTo':
      return ['foreignKey', 'targetKey'];
    case 'hasOne':
    case 'hasMany':
      return ['sourceKey', 'foreignKey'];
    case 'belongsToMany':
      return ['sourceKey', 'targetKey', 'foreignKey', 'otherKey', 'through'];
  }
}

export function requireRelationOption(
  relation: Pick<RelationFieldDefinition, 'name' | 'type' | RelationKeyOption>,
  option: RelationKeyOption,
): string {
  const value = relation[option];
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new RelationConfigurationError(relation.name, option);
  }
  return value;
}

export function validateRelationOptions(
  relation: RelationFieldDefinition,
): void {
  for (const option of requiredRelationOptions(relation.type))
    requireRelationOption(relation, option);
}
