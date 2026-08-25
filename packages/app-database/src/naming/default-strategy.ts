import type { NamingOptions } from '../collection/types.js';
import type { NamingStrategy } from './strategy.js';
import { snakeCase, truncateIdentifier } from './utils.js';

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

  foreignKeyName(
    tableName: string,
    columns: string[],
    targetTable: string,
  ): string {
    return truncateIdentifier(
      `fk_${tableName}_${columns.join('_')}_${targetTable}`,
    );
  }

  private normalize(value: string): string {
    return this.options.underscored ? snakeCase(value) : value;
  }
}
