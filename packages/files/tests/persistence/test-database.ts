import { DatabaseSync } from "node:sqlite";
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, type CompiledQuery, type DatabaseConnection, type Dialect, type Driver, type QueryResult } from "kysely";
import type { FilesDatabase } from "../../src/persistence/database-types.ts";

const value = (v: unknown) => v instanceof Date ? v.toISOString() : v as string | number | bigint | null | Uint8Array;

class Connection implements DatabaseConnection {
  constructor(private readonly db: DatabaseSync) {}
  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const statement = this.db.prepare(query.sql);
    const parameters = query.parameters.map(value);
    if (statement.columns().length) return { rows: statement.all(...parameters) as R[] };
    const result = statement.run(...parameters);
    return { rows: [], insertId: result.lastInsertRowid, numAffectedRows: BigInt(result.changes) };
  }
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> { throw new Error("Streaming is not supported in tests"); }
}

class NodeSqliteDriver implements Driver {
  private readonly db = new DatabaseSync(":memory:");
  private readonly connection = new Connection(this.db);
  async init() { this.db.exec("PRAGMA foreign_keys = ON"); }
  async acquireConnection() { return this.connection; }
  async beginTransaction(connection: DatabaseConnection) { await connection.executeQuery({ sql: "begin", parameters: [] } as CompiledQuery); }
  async commitTransaction(connection: DatabaseConnection) { await connection.executeQuery({ sql: "commit", parameters: [] } as CompiledQuery); }
  async rollbackTransaction(connection: DatabaseConnection) { await connection.executeQuery({ sql: "rollback", parameters: [] } as CompiledQuery); }
  async releaseConnection() {}
  async destroy() { this.db.close(); }
}

class NodeSqliteDialect implements Dialect {
  createDriver() { return new NodeSqliteDriver(); }
  createQueryCompiler() { return new SqliteQueryCompiler(); }
  createAdapter() { return new SqliteAdapter(); }
  createIntrospector(db: Kysely<unknown>) { return new SqliteIntrospector(db); }
}

export function createTestDatabase(): Kysely<FilesDatabase> { return new Kysely<FilesDatabase>({ dialect: new NodeSqliteDialect() }); }
