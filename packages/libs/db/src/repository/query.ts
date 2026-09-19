import { RepositoryError } from './errors.js';
import type { RepositoryQuery } from './types.js';

/** One lazy execution, with a single choice of consumption mode. */
export class DefaultRepositoryQuery<T> implements RepositoryQuery<T> {
  private mode?: 'array' | 'iterator';
  private promise?: Promise<T[]>;

  constructor(
    private readonly execute: () => Promise<T[]>,
    private readonly iterate: () => AsyncIterator<T>,
  ) {}

  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.collect().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T[] | TResult> {
    return this.collect().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T[]> {
    return this.collect().finally(onfinally);
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    if (this.mode) throw consumptionError();
    this.mode = 'iterator';
    return this.iterate();
  }

  private collect(): Promise<T[]> {
    if (this.mode === 'iterator') return Promise.reject(consumptionError());
    if (!this.promise) {
      this.mode = 'array';
      this.promise = this.run();
    }
    return this.promise;
  }

  private async run(): Promise<T[]> {
    return this.execute();
  }
}

function consumptionError(): RepositoryError {
  return new RepositoryError(
    'QUERY_ALREADY_CONSUMED',
    'A Repository query cannot mix consumption modes or be iterated twice. Create a new findMany query to execute again.',
  );
}
