import { describe, expect, it } from 'vitest';

import { joinDriveUrl } from '../src/index.js';

describe('joinDriveUrl', () => {
  it('joins absolute URLs and encodes key segments', () => {
    expect(joinDriveUrl('https://cdn.example.com/assets', 'avatars/user 1.png')).toBe(
      'https://cdn.example.com/assets/avatars/user%201.png',
    );
  });

  it('joins app-local paths and encodes key segments', () => {
    expect(joinDriveUrl('/storage', 'reports/2026 Q3.pdf')).toBe('/storage/reports/2026%20Q3.pdf');
  });
});
