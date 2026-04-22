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

describe('useCanonicalFields', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'fake-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          fields: [
            { key: 'supplier_name', label: 'Supplier Name', required: true, dtype: 'string', max_length: 255 },
            { key: 'supplier_code', label: 'Supplier Code', required: true, dtype: 'code', max_length: 50 },
          ],
        }),
        text: async () => '',
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches canonical fields and returns them', async () => {
    const { result } = renderHook(() => useCanonicalFields(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.fields).toHaveLength(2);
    expect(result.current.data?.fields[0].key).toBe('supplier_name');
  });

  it('calls the correct endpoint', async () => {
    renderHook(() => useCanonicalFields(), { wrapper });
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/canonical-fields'),
        expect.any(Object),
      );
    });
  });
});
