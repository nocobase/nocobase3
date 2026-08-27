import { describe, expect, it } from 'vitest';

import { MAX_FILE_NAME_LENGTH, normalizeFileName } from '../server/filename.js';

describe('normalizeFileName', () => {
  it('strips path components and replaces unsafe characters', () => {
    expect(normalizeFileName('  ../folder\\report: final?.pdf  ')).toBe(
      'report-final.pdf',
    );
  });

  it('uses a safe fallback when no useful name remains', () => {
    expect(normalizeFileName('\u0000<>:"/\\|?*')).toBe('upload.bin');
    expect(normalizeFileName('   ')).toBe('upload.bin');
  });

  it('retains a safe extension when the visible stem is replaced', () => {
    expect(normalizeFileName('合同.pdf')).toBe('upload.pdf');
  });

  it('caps the visible name while retaining a useful extension', () => {
    const normalized = normalizeFileName(`${'a'.repeat(200)}.pdf`);

    expect(normalized).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(normalized.endsWith('.pdf')).toBe(true);
  });

  it('is deterministic', () => {
    expect(normalizeFileName('Quarterly Report (final).xlsx')).toBe(
      normalizeFileName('Quarterly Report (final).xlsx'),
    );
  });
});
