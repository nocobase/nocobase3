import { describe, expect, it, vi } from 'vitest';
import {
  defineDatabaseContractSuite,
  type DatabaseContractContext,
} from '../src/index.js';

describe('database contract definition', () => {
  it('passes the dialect-owned context factory to the contract', () => {
    const createContext = vi.fn();
    const define = vi.fn();

    defineDatabaseContractSuite<DatabaseContractContext>(
      { createContext, title: 'shared' },
      define,
    );

    expect(define).toHaveBeenCalledWith(createContext);
  });
});
