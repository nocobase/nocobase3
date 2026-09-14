import { describe, expect, it } from 'vitest';

import {
  formatClientDateTime,
  formatClientRelativeTime,
} from '../client/pages/date-time.js';

describe('formatClientDateTime', () => {
  it('formats an instant as local time without a timezone label', () => {
    const instant = '2026-09-01T02:00:00.000Z';
    const expected = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(instant));

    expect(formatClientDateTime(instant)).toBe(expected);
    expect(formatClientDateTime(instant)).not.toBe(instant);

    // The same formatter with `timeZoneName: 'short'` produces a different
    // string, so matching the plain expectation above proves the label was
    // dropped rather than that this runtime has no label to add.
    expect(
      new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(new Date(instant)),
    ).not.toBe(expected);
  });

  it('preserves an invalid value instead of throwing', () => {
    expect(formatClientDateTime('not-a-date')).toBe('not-a-date');
    expect(formatClientRelativeTime('not-a-date')).toBeUndefined();
  });

  it('formats past and future instants relative to the client clock', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    const formatter = new Intl.RelativeTimeFormat(undefined, {
      numeric: 'auto',
    });

    expect(formatClientRelativeTime('2026-09-02T10:00:00.000Z', now)).toBe(
      formatter.format(-2, 'hour'),
    );
    expect(formatClientRelativeTime('2026-09-05T12:00:00.000Z', now)).toBe(
      formatter.format(3, 'day'),
    );
  });
});
