import { expect, it } from 'vitest';
import { parseCsvHeaders } from '../csvHeaders';

it('detects comma-delimited headers', async () => {
  const file = new File(['supplier_name,short_name\nAcme,A1\n'], 'suppliers.csv');
  await expect(parseCsvHeaders(file)).resolves.toEqual({
    columns: ['supplier_name', 'short_name'],
    delimiter: ',',
  });
});

it('detects semicolon-delimited headers', async () => {
  const file = new File(['supplier_name;short_name\nAcme;A1\n'], 'suppliers.csv');
  await expect(parseCsvHeaders(file)).resolves.toEqual({
    columns: ['supplier_name', 'short_name'],
    delimiter: ';',
  });
});
