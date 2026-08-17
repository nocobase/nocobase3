export interface NamingStrategy {
  collectionToTableName(collectionName: string): string;
  fieldToColumnName(fieldName: string): string;
  relationForeignKey(fieldName: string): string;
  indexName(tableName: string, columns: string[]): string;
  foreignKeyName(tableName: string, columns: string[], targetTable: string): string;
}
