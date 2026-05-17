import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import ReviewQueue from '../ReviewQueue'
import { useSearch } from '../../contexts/SearchContext'
import type { ReviewQueueResponse } from '../../api/types'

const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockQueue: ReviewQueueResponse = {
  items: [
    {
      id: 1,
      type: 'supplier',
      record_a_id: 10,
      record_b_id: 20,
      record_a_name: 'Acme Corp',
      record_b_name: 'ACME Corporation',
      record_a_source: 'SAP',
      record_b_source: 'Oracle',
      record_a_fields: { currency: 'USD', contact_name: 'Alice' },
      record_b_fields: { currency: 'USD', contact_name: 'Alicia' },
      confidence: 0.92,
      match_signals: { jaro_winkler: 0.95 },
      status: 'pending',
      group_id: 1,
      created_at: '2026-03-28T10:00:00Z',
      reviewed_by: null,
      reviewed_at: null,
    },
    {
      id: 2,
      type: 'supplier',
      record_a_id: 30,
      record_b_id: 40,
      record_a_name: 'Beta Inc',
      record_b_name: 'Beta Industries',
      record_a_source: 'SAP',
      record_b_source: 'Oracle',
      record_a_fields: { currency: 'EUR', contact_name: 'Bob' },
      record_b_fields: { currency: 'EUR', contact_name: 'Robert' },
      confidence: 0.75,
      match_signals: {},
      status: 'confirmed',
      group_id: 2,
      created_at: '2026-03-28T11:00:00Z',
      reviewed_by: 'reviewer@example.com',
      reviewed_at: '2026-03-28T11:30:00Z',
    },
  ],
  total: 2,
  has_more: false,
}

const mockStats = {
  total_pending: 25,
  total_confirmed: 40,
  total_rejected: 10,
  total_unified: 60,
}

const mockSources = [
  {
    id: 1,
    name: 'SAP',
    type: 'supplier',
    description: '',
    delimiter: ',',
    column_mapping: {},
    created_at: '',
    updated_at: '',
  },
  {
    id: 2,
    name: 'Oracle',
    type: 'supplier',
    description: '',
    delimiter: ',',
    column_mapping: {},
    created_at: '',
    updated_at: '',
  },
]

const mockRecordTypes = {
  types: [{ key: 'supplier', label: 'Supplier', field_count: 3 }],
}

const mockRuns = [
  {
    id: 99,
    type: 'supplier',
    mode: 'FILE_VS_FILE',
    status: 'completed',
    name: null,
    created_by: 'tester',
    created_at: '2026-03-28T09:00:00Z',
    started_at: null,
    finished_at: null,
    task_id: null,
    stats: {},
    batch_ids: [1, 2],
    batches: [
      { id: 1, filename: 'sap.csv' },
      { id: 2, filename: 'oracle.csv' },
    ],
    error_message: null,
  },
]

const mockSupplierType = {
  key: 'supplier',
  label: 'Supplier',
  fields: [
    { key: 'supplier_name', label: 'Supplier Name', role: 'name', required: true },
    { key: 'currency', label: 'Currency', role: 'enum', required: false },
    { key: 'contact_name', label: 'Contact', role: 'extra', required: false },
  ],
  signals: [],
}

function setupFetch(queueOverride?: Partial<typeof mockQueue>) {
  const queue = { ...mockQueue, ...queueOverride }
  vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
    const urlStr = String(url)
    const method = init?.method ?? 'GET'
    if (urlStr.includes('/api/record-types/supplier')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockSupplierType), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/record-types')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockRecordTypes), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/review/queue')) {
      return Promise.resolve(
        new Response(JSON.stringify(queue), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/review/stats')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockStats), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/matches')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockRuns), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/sources')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockSources), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/review/candidates/1/confirm') && method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ candidate_id: 1, action: 'confirmed', unified_record_id: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/review/candidates/1/reject') && method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ candidate_id: 1, action: 'rejected', unified_record_id: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    return Promise.resolve(new Response('Not found', { status: 404 }))
  })
}

function SearchSetter({ query }: { query: string }) {
  const { setQuery } = useSearch()
  useEffect(() => { setQuery(query) }, [query, setQuery])
  return null
}

describe('ReviewQueue page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state while fetching', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url) => {
      const urlStr = String(url)
      if (urlStr.includes('/api/record-types/supplier')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockSupplierType), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      if (urlStr.includes('/api/record-types')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockRecordTypes), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      if (urlStr.includes('/api/matches')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockRuns), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      return new Promise(() => {})
    })
    const { container } = render(<ReviewQueue />)
    // LoadingErrorEmpty renders a <Spinner /> (no text) during loading
    await vi.waitFor(() => {
      expect(container.querySelector('.spin')).toBeInTheDocument()
    })
  })

  it('renders empty state when queue is empty', async () => {
    setupFetch({ items: [], total: 0, has_more: false })
    render(<ReviewQueue />)
    await screen.findByText(/no candidates match/i)
  })

  it('renders candidate rows with supplier names', async () => {
    setupFetch()
    render(<ReviewQueue />)
    await screen.findByText('Acme Corp')
    expect(screen.getByText('ACME Corporation')).toBeInTheDocument()
    expect(screen.getByText('Beta Inc')).toBeInTheDocument()
    expect(screen.getByText('Beta Industries')).toBeInTheDocument()
  })

  it('does not render a page-local record type selector', async () => {
    setupFetch()
    render(<ReviewQueue />)
    await screen.findByText('Acme Corp')
    expect(screen.queryByRole('tablist', { name: /record type/i })).not.toBeInTheDocument()
  })

  it('renders confidence values with correct tone colors', async () => {
    const lowConfItem = {
      id: 3,
      type: 'supplier',
      record_a_id: 50,
      record_b_id: 60,
      record_a_name: 'Gamma Ltd',
      record_b_name: 'Gamma LLC',
      record_a_source: 'SAP',
      record_b_source: 'Oracle',
      record_a_fields: { currency: 'GBP', contact_name: 'Gina' },
      record_b_fields: { currency: 'GBP', contact_name: 'Georgina' },
      confidence: 0.40,
      match_signals: {},
      status: 'pending',
      group_id: 3,
      created_at: '2026-03-28T12:00:00Z',
      reviewed_by: null,
      reviewed_at: null,
    }
    setupFetch({ items: [...mockQueue.items, lowConfItem], total: 3 })
    render(<ReviewQueue />)

    await screen.findByText('Acme Corp')

    // ConfRing renders confidence as integer pct (Math.round(value * 100)) with var(--tone) color
    const value92 = screen.getByText('92')
    expect(value92.getAttribute('style') || '').toMatch(/--ok/)

    const value75 = screen.getAllByText('75').find(el => (el.getAttribute('style') || '').includes('--warn'))
    expect(value75).toBeTruthy()
    expect(value75?.getAttribute('style') || '').toMatch(/--warn/)

    // '40' also appears as a bucket count; find the ConfRing element by its danger style
    const value40 = screen.getAllByText('40').find(el => (el.getAttribute('style') || '').includes('--danger'))
    expect(value40).toBeTruthy()
  })

  it('renders status pills', async () => {
    setupFetch()
    render(<ReviewQueue />)
    await screen.findByText('Acme Corp')
    expect(screen.getByText('pending')).toBeInTheDocument()
    // 'Confirmed dupe' appears in both the bucket tab and the status pill
    expect(screen.getAllByText('Confirmed dupe').length).toBeGreaterThan(0)
  })

  it('filters by search query from SearchContext', async () => {
    setupFetch()
    render(
      <>
        <SearchSetter query="Acme" />
        <ReviewQueue />
      </>,
    )
    await screen.findByText('Acme Corp')
    expect(screen.getByText('ACME Corporation')).toBeInTheDocument()
    expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta Industries')).not.toBeInTheDocument()
  })

  it('confirms a pending candidate in place when clicking Same', async () => {
    setupFetch()
    const user = userEvent.setup()
    render(<ReviewQueue />)
    await screen.findByText('Acme Corp')
    await user.click(screen.getByRole('button', { name: /same/i }))
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/review/candidates/1/confirm',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(mockNavigate).not.toHaveBeenCalledWith('/review/1?type=supplier')
  })

  it('renders pagination when total exceeds page size', async () => {
    setupFetch({ total: 100, has_more: true })
    render(<ReviewQueue />)
    await screen.findByText('Acme Corp')
    // Pagination renders both top + bottom (each is a <nav aria-label="Pagination">)
    expect(screen.getAllByRole('navigation', { name: /pagination/i })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /page 1/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /page 2/i }).length).toBeGreaterThan(0)
  })
})
