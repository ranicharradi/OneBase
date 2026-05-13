import { describe, expect, it, vi, beforeEach } from 'vitest';

import { parseFileHeaders } from '../fileHeaders';

describe('parseFileHeaders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts file to /api/sources/detect-headers and returns response', async () => {
    const file = new File(['code;name\n001;Acme\n'], 'vendors.csv');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ columns: ['code', 'name'], delimiter: ';', format: 'csv' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await parseFileHeaders(file);

    expect(result).toEqual({ columns: ['code', 'name'], delimiter: ';', format: 'csv' });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/api\/sources\/detect-headers$/);
    expect((init?.body as FormData).get('file')).toBe(file);
  });

  it('handles xlsx files', async () => {
    const file = new File([new ArrayBuffer(64)], 'vendors.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ columns: ['code', 'name'], delimiter: null, format: 'xlsx' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await parseFileHeaders(file);
    expect(result).toEqual({ columns: ['code', 'name'], delimiter: null, format: 'xlsx' });
  });

  it('throws when the backend returns an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Only .csv and .xlsx files are accepted' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      parseFileHeaders(new File(['x'], 'vendors.pdf')),
    ).rejects.toThrow(/csv/i);
  });
});
