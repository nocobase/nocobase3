import type { DatabaseConnection } from '../database/connection.js';
import type { TransactionHandle } from '../database/transaction.js';
import type { InsertResult, UpdateResult, DeleteResult } from './types.js';

export interface ManagedWriteDescriptor {
  readonly executionId: string;
  readonly operation: 'insert' | 'update' | 'delete';
  readonly managerId: string;
  readonly connectionId: string;
  readonly connection: DatabaseConnection;
  readonly target: { readonly table: string; readonly schema?: string };
  readonly transaction?: TransactionHandle;
  summarize(result: ManagedWriteResult): ManagedWriteSummary;
}
export interface ManagedWriteSummary {
  readonly count?: number;
  readonly countSemantics:
    'matched' | 'changed' | 'inserted' | 'deleted' | 'unknown';
}
export type ManagedWriteResult = InsertResult | UpdateResult | DeleteResult;
/** The callback is single-use, runs on the supplied connection and is never retried. */
export type ManagedWriteInterceptor = <T extends ManagedWriteResult>(
  descriptor: ManagedWriteDescriptor,
  execute: (connection: DatabaseConnection) => Promise<T>,
) => Promise<T>;
/** Looked up when execute runs, including cached builders and transaction children. */
export interface ManagedWriteRegistry {
  register(interceptor: ManagedWriteInterceptor): () => void;
}
