// How a lifecycle refusal becomes the standard error body a plugin's routes answer.
import { describe, expect, it } from 'vitest';

import { LifecycleError, lifecycleErrorFields } from '../src/index.js';

describe('lifecycleErrorFields', () => {
  it('maps every refusal a caller can act on to a standard status', () => {
    const statuses = Object.fromEntries(
      (
        [
          'UNKNOWN_LIFECYCLE',
          'RECORD_NOT_FOUND',
          'UNKNOWN_TRANSITION',
          'INVALID_INPUT',
          'REQUEST_REUSED',
          'GUARD_REJECTED',
          'INVALID_STATE',
          'UNKNOWN_EFFECT',
          'RUN_SETTLED',
          'CONFLICT',
        ] as const
      ).map((code) => [
        code,
        lifecycleErrorFields(new LifecycleError(code, 'No.'))?.status,
      ]),
    );
    expect(statuses).toEqual({
      UNKNOWN_LIFECYCLE: 'NOT_FOUND',
      RECORD_NOT_FOUND: 'NOT_FOUND',
      UNKNOWN_TRANSITION: 'INVALID_ARGUMENT',
      INVALID_INPUT: 'INVALID_ARGUMENT',
      REQUEST_REUSED: 'INVALID_ARGUMENT',
      GUARD_REJECTED: 'PERMISSION_DENIED',
      INVALID_STATE: 'FAILED_PRECONDITION',
      UNKNOWN_EFFECT: 'FAILED_PRECONDITION',
      RUN_SETTLED: 'FAILED_PRECONDITION',
      CONFLICT: 'ABORTED',
    });
  });

  it('leaves the server’s own faults to the application’s 500', () => {
    for (const code of [
      'INVALID_DEFINITION',
      'INVALID_ROUTE',
      'INVALID_SET',
    ] as const)
      expect(lifecycleErrorFields(new LifecycleError(code, 'Bug.'))).toBe(
        undefined,
      );
  });

  it('carries the blockers, and names each input problem where it sits in the body', () => {
    const refused = new LifecycleError('GUARD_REJECTED', 'Not yours.', {
      blockers: [
        { source: 'guard', code: 'notYourLine', message: 'Not yours.' },
      ],
    });
    expect(lifecycleErrorFields(refused)).toEqual({
      status: 'PERMISSION_DENIED',
      reason: 'GUARD_REJECTED',
      message: 'Not yours.',
      metadata: { blockers: refused.blockers, problems: [] },
    });
    const invalid = new LifecycleError(
      'INVALID_INPUT',
      'Pick a line; Say why.',
      {
        problems: [
          { field: 'line', message: 'Pick a line.' },
          { message: 'Say why.' },
        ],
      },
    );
    expect(
      lifecycleErrorFields(invalid, { inputField: 'input' }),
    ).toMatchObject({
      status: 'INVALID_ARGUMENT',
      fieldViolations: [
        { field: 'input.line', description: 'Pick a line.' },
        { field: 'input', description: 'Say why.' },
      ],
      metadata: { problems: invalid.problems },
    });
    // A creation's values are the body itself; a problem with no field names none.
    expect(lifecycleErrorFields(invalid)?.fieldViolations).toEqual([
      { field: 'line', description: 'Pick a line.' },
    ]);
  });

  it('names the body field a request id or a transition refusal is about', () => {
    expect(
      lifecycleErrorFields(new LifecycleError('REQUEST_REUSED', 'Spent.'))
        ?.fieldViolations,
    ).toEqual([{ field: 'requestId', description: 'Spent.' }]);
    expect(
      lifecycleErrorFields(new LifecycleError('UNKNOWN_TRANSITION', 'None.'))
        ?.fieldViolations,
    ).toEqual([{ field: 'transition', description: 'None.' }]);
  });
});
