import { describe, expect, it } from 'vitest';
import { datasourceFileLabel } from '../filename';

describe('datasourceFileLabel', () => {
  it('composes name + extension', () => {
    expect(datasourceFileLabel({ data_source_name: 'Industry A Suppliers', file_extension: '.xlsx' }))
      .toBe('Industry A Suppliers.xlsx');
  });
  it('handles missing extension', () => {
    expect(datasourceFileLabel({ data_source_name: 'X', file_extension: '' })).toBe('X');
  });
  it('does not double-add a leading dot', () => {
    expect(datasourceFileLabel({ data_source_name: 'X', file_extension: 'csv' })).toBe('X.csv');
  });
});
