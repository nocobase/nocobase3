/** A refusal of the example's own routes: a bad form, a wrong persona, a missing record. */
export class ExampleError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID',
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExampleError';
  }
}
