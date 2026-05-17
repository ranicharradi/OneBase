// frontend/src/utils/__tests__/fileFormat.test.ts
import { describe, expect, it } from 'vitest';

import {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_ACCEPT,
  extensionOf,
  isAllowedUpload,
} from '../fileFormat';

describe('fileFormat', () => {
  it('parses extensions case-insensitively', () => {
    expect(extensionOf('data.csv')).toBe('.csv');
    expect(extensionOf('Book1.XLSX')).toBe('.xlsx');
    expect(extensionOf('noext')).toBe('');
    expect(extensionOf('trailing.')).toBe('');
  });

  it('checks the allow-list', () => {
    expect(isAllowedUpload('good.csv')).toBe(true);
    expect(isAllowedUpload('good.xlsx')).toBe(true);
    expect(isAllowedUpload('evil.tsv')).toBe(false);
  });

  it('exposes a stable allow-list and accept string', () => {
    expect(ALLOWED_UPLOAD_EXTENSIONS).toEqual(['.csv', '.xlsx']);
    expect(ALLOWED_UPLOAD_ACCEPT).toContain('.csv');
    expect(ALLOWED_UPLOAD_ACCEPT).toContain('.xlsx');
  });
});
