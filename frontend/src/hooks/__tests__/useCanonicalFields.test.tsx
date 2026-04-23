import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCanonicalFields } from '../useCanonicalFields';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const fixtureFields = [
  { key: 'supplier_name', label: 'Supplier Name', required: true, dtype: 'string', max_length: 255 },
  { key: 'supplier_code', label: 'Supplier Code', required: true, dtype: 'code', max_length: 50 },
];

describe('useCanonicalFields', () => {
  beforeEach(() => {
    localStorage.setItem('onebase_token', 'fake-token');
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ fields: fixtureFields }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('fetches canonical fields and returns them', async () => {
    const { result } = renderHook(() => useCanonicalFields(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.fields).toEqual(fixtureFields);
  });

  it('calls /api/canonical-fields with a bearer token', async () => {
    renderHook(() => useCanonicalFields(), { wrapper });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
    const call = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toContain('/api/canonical-fields');
    // Headers can be either Headers instance or plain object depending on fetch shim
    const headers = init.headers as Headers | Record<string, string>;
    const authHeader = headers instanceof Headers ? headers.get('Authorization') : headers['Authorization'];
    expect(authHeader).toBe('Bearer fake-token');
  });
});
