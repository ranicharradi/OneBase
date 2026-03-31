import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect } from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import ReviewQueue from '../ReviewQueue'
import { useSearch } from '../../contexts/SearchContext'

// ── Mock useNavigate ──────────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

// ── Mock data ─────────────────────────────────────────────────────────

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
  total_skipped: 5,
  total_unified: 60,
}

const mockSources = [
  { id: 1, name: 'SAP', description: '', column_mapping: {}, created_at: '', updated_at: '' },
  { id: 2, name: 'Oracle', description: '', column_mapping: {}, created_at: '', updated_at: '' },
]

// ── Helpers ───────────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────

describe('ReviewQueue page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading skeleton while fetching', () => {
    // Never-resolving fetch keeps us in loading state
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<ReviewQueue />)

    const shimmerElements = document.querySelectorAll('.animate-shimmer')
    expect(shimmerElements.length).toBeGreaterThan(0)
  })

  it('renders "No candidates found" when queue is empty', async () => {
    setupFetch({ items: [], total: 0, has_more: false })

    render(<ReviewQueue />)

    await screen.findByText('No candidates found')
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument()
  })

  it('renders candidate rows with supplier names', async () => {
    setupFetch()

    render(<ReviewQueue />)

    // Wait for supplier names to appear
    await screen.findByText('Acme Corp')
    expect(screen.getByText('ACME Corporation')).toBeInTheDocument()
    expect(screen.getByText('Beta Inc')).toBeInTheDocument()
    expect(screen.getByText('Beta Industries')).toBeInTheDocument()
  })

  it('renders confidence badges with correct colors (high/mid/low)', async () => {
    // Add a third item with low confidence (<65%)
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

    // Wait for data to load
    await screen.findByText('Acme Corp')

    // High confidence: 92% (>=85) -> text-success-500
    const badge92 = screen.getByText('92%')
    expect(badge92.className).toContain('text-success-500')

    // Mid confidence: 75% (>=65, <85) -> text-secondary-500
    const badge75 = screen.getByText('75%')
    expect(badge75.className).toContain('text-secondary-500')

    // Low confidence: 40% (<65) -> text-danger-500
    const badge40 = screen.getByText('40%')
    expect(badge40.className).toContain('text-danger-500')
  })

  it('renders status badges', async () => {
    setupFetch()

    render(<ReviewQueue />)

    await screen.findByText('Acme Corp')

    // Item 1 has status 'pending', item 2 has status 'confirmed'
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('confirmed')).toBeInTheDocument()
  })

  it('filters by search query from SearchContext', async () => {
    setupFetch()

    render(
      <>
        <SearchSetter query="Acme" />
        <ReviewQueue />
      </>,
    )

    // Wait for data and search filter to apply
    await screen.findByText('Acme Corp')
    expect(screen.getByText('ACME Corporation')).toBeInTheDocument()

    // Beta items should be filtered out (search is "Acme")
    expect(screen.queryByText('Beta Inc')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta Industries')).not.toBeInTheDocument()
  })

  it('navigates to /review/:id when clicking a row', async () => {
    setupFetch()
    const user = userEvent.setup()

    render(<ReviewQueue />)

    await screen.findByText('Acme Corp')

    // Click the supplier name — event bubbles up to the row's onClick handler
    await user.click(screen.getByText('Acme Corp'))

    expect(mockNavigate).toHaveBeenCalledWith('/review/1')
  })

  it('renders pagination when total > pageSize', async () => {
    setupFetch({ total: 100, has_more: true })

    render(<ReviewQueue />)

    // Wait for data to load
    await screen.findByText('Acme Corp')

    // Pagination nav should be present
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument()

    // Verify pagination displays the total count (100 appears in both the
    // filter result count and in pagination, so scope to the nav element)
    const paginationNav = screen.getByRole('navigation', { name: /pagination/i })
    expect(paginationNav).toHaveTextContent('100')
  })
})
