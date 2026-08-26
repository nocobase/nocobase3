export interface RuntimeTransactionManager {
  transaction<T>(callback: (connection: unknown) => Promise<T>): Promise<T>;
}
