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
    expect(normalizeFileName('../..')).toBe('upload.bin');
    expect(normalizeFileName('\r\n\u0000')).toBe('upload.bin');
  });

  it('retains Unicode in the visible filename while keeping its extension', () => {
    expect(normalizeFileName('合同.pdf')).toBe('合同.pdf');
    expect(normalizeFileName('résumé.pdf')).toBe('résumé.pdf');
    expect(normalizeFileName('設計資料📄.pdf')).toBe('設計資料📄.pdf');
  });

  it('caps the visible name while retaining a useful extension', () => {
    const normalized = normalizeFileName(`${'a'.repeat(200)}.pdf`);

    expect(normalized).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(normalized.endsWith('.pdf')).toBe(true);
  });

  it('removes path, control, quote, and header injection characters', () => {
    expect(normalizeFileName('../../采购\r\n"合同".pdf')).toBe('采购-合同.pdf');
    expect(normalizeFileName('folder\\設計資料.pdf')).toBe('設計資料.pdf');
  });

  it('preserves double extensions and counts Unicode code points when truncating', () => {
    expect(normalizeFileName('archive.tar.gz')).toBe('archive.tar.gz');
    const normalized = normalizeFileName(`${'📄'.repeat(200)}.pdf`);
    expect(Array.from(normalized)).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(normalized.endsWith('.pdf')).toBe(true);
  });

  it('is deterministic', () => {
    expect(normalizeFileName('Quarterly Report (final).xlsx')).toBe(
      normalizeFileName('Quarterly Report (final).xlsx'),
    );
  });
});
