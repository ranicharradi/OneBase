import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useRecordType, useRecordTypes } from '../useRecordTypes'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/api/record-types')) {
      return new Response(JSON.stringify({ types: [{ key: 'supplier', label: 'Supplier', field_count: 7 }] }))
    }
    if (url.endsWith('/api/record-types/supplier')) {
      return new Response(JSON.stringify({
        key: 'supplier',
        label: 'Supplier',
        fields: [{ key: 'supplier_name', label: 'Supplier Name', role: 'name', required: true }],
        signals: [],
      }))
    }
    return new Response('not found', { status: 404 })
  }))
})

it('fetches the record type list', async () => {
  const { result } = renderHook(() => useRecordTypes(), { wrapper })
  await waitFor(() => expect(result.current.data?.types[0].key).toBe('supplier'))
})

it('fetches one record type by key', async () => {
  const { result } = renderHook(() => useRecordType('supplier'), { wrapper })
  await waitFor(() => expect(result.current.data?.fields[0].key).toBe('supplier_name'))
})
