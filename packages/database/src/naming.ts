import type { NamingOptions } from './types.js';

export interface NamingStrategy {
  collectionToTableName(collectionName: string): string;
  fieldToColumnName(fieldName: string): string;
  relationForeignKey(fieldName: string): string;
  indexName(tableName: string, columns: string[]): string;
  foreignKeyName(tableName: string, columns: string[], targetTable: string): string;
}

export class DefaultNamingStrategy implements NamingStrategy {
  private readonly options: Required<NamingOptions>;

  constructor(options: NamingOptions = {}) {
    this.options = {
      underscored: options.underscored ?? true,
      tablePrefix: options.tablePrefix ?? '',
    };
  }

  collectionToTableName(collectionName: string): string {
    return `${this.options.tablePrefix}${this.normalize(collectionName)}`;
  }

  fieldToColumnName(fieldName: string): string {
    return this.normalize(fieldName);
  }

  relationForeignKey(fieldName: string): string {
    return `${this.normalize(fieldName)}_id`;
  }

  indexName(tableName: string, columns: string[]): string {
    return truncateIdentifier(`idx_${tableName}_${columns.join('_')}`);
  }

  foreignKeyName(tableName: string, columns: string[], targetTable: string): string {
    return truncateIdentifier(`fk_${tableName}_${columns.join('_')}_${targetTable}`);
  }

  private normalize(value: string): string {
    return this.options.underscored ? snakeCase(value) : value;
  }
}

export function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

export function truncateIdentifier(identifier: string, maxLength = 63): string {
  if (identifier.length <= maxLength) {
    return identifier;
  }

  const hash = fnv1a(identifier);
  return `${identifier.slice(0, maxLength - hash.length - 1)}_${hash}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
