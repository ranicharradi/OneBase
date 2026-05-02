import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import ReviewQueue from '../ReviewQueue'
import { useSearch } from '../../contexts/SearchContext'

const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockQueue = {
  items: [
    {
      id: 1,
      supplier_a_id: 10,
      supplier_b_id: 20,
      supplier_a_name: 'Acme Corp',
      supplier_b_name: 'ACME Corporation',
      supplier_a_source: 'SAP',
      supplier_b_source: 'Oracle',
      confidence: 0.92,
      match_signals: { jaro_winkler: 0.95 },
      status: 'pending',
      group_id: 1,
      created_at: '2026-03-28T10:00:00Z',
    },
    {
      id: 2,
      supplier_a_id: 30,
      supplier_b_id: 40,
      supplier_a_name: 'Beta Inc',
      supplier_b_name: 'Beta Industries',
      supplier_a_source: 'SAP',
      supplier_b_source: 'Oracle',
      confidence: 0.75,
      match_signals: {},
      status: 'confirmed',
      group_id: 2,
      created_at: '2026-03-28T11:00:00Z',
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
  { id: 1, name: 'SAP', description: '', column_mapping: {}, created_at: '', updated_at: '' },
  { id: 2, name: 'Oracle', description: '', column_mapping: {}, created_at: '', updated_at: '' },
]

function setupFetch(queueOverride?: Partial<typeof mockQueue>) {
  const queue = { ...mockQueue, ...queueOverride }
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const urlStr = String(url)
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
    if (urlStr.includes('/api/sources')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockSources), {
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

  it('renders loading state while fetching', () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))
    render(<ReviewQueue />)
    expect(screen.getByText(/loading queue/i)).toBeInTheDocument()
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

  it('renders confidence values with correct tone colors', async () => {
    const lowConfItem = {
      id: 3,
      supplier_a_id: 50,
      supplier_b_id: 60,
      supplier_a_name: 'Gamma Ltd',
      supplier_b_name: 'Gamma LLC',
      supplier_a_source: 'SAP',
      supplier_b_source: 'Oracle',
      confidence: 0.40,
      match_signals: {},
      status: 'pending',
      group_id: 3,
      created_at: '2026-03-28T12:00:00Z',
    }
    setupFetch({ items: [...mockQueue.items, lowConfItem], total: 3 })
    render(<ReviewQueue />)

    await screen.findByText('Acme Corp')

    // ConfRing renders confidence as integer pct (Math.round(value * 100)) with var(--tone) color
    const value92 = screen.getByText('92')
    expect(value92.getAttribute('style') || '').toMatch(/--ok/)

    const value75 = screen.getByText('75')
    expect(value75.getAttribute('style') || '').toMatch(/--warn/)

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

  it('navigates to /review/:id when clicking a row', async () => {
    setupFetch()
    const user = userEvent.setup()
    render(<ReviewQueue />)
    await screen.findByText('Acme Corp')
    await user.click(screen.getByRole('button', { name: /same/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/review/1')
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
