import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '../../test/test-utils'
import Dashboard from '../Dashboard'
import { useAuth } from '../../hooks/useAuth'
import type { DashboardResponse, ModelStatusResponse } from '../../api/types'

// Mock useAuth — auth state varies per test
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock useMatchingNotifications — prevents WebSocket connections in tests
vi.mock('../../hooks/useMatchingNotifications', () => ({
  useMatchingNotifications: vi.fn(),
}))

const mockDashboard: DashboardResponse = {
  uploads: { total_batches: 5, completed: 4, failed: 1, total_staged: 150 },
  matching: { total_candidates: 80, total_groups: 25, avg_confidence: 0.78 },
  review: { pending: 25, confirmed: 40, rejected: 10 },
  unified: { total_unified: 60, merged: 45, singletons: 15 },
  recent_activity: [],
}

const mockModelStatus: ModelStatusResponse = {
  last_trained: '2026-03-27T08:00:00Z',
  review_count: 55,
  current_weights: { jaro_winkler: 0.30, token_jaccard: 0.20, embedding_cosine: 0.25 },
  ml_model_exists: true,
}

function setupAuthAs(role: 'admin' | 'viewer') {
  ;(useAuth as Mock).mockReturnValue({
    user: {
      id: 1,
      username: role === 'admin' ? 'admin' : 'viewer',
      is_active: true,
      role,
      created_at: '2026-01-01T00:00:00Z',
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

const mockRecordTypes = { types: [{ key: 'supplier', label: 'Supplier', field_count: 7 }] }

function setupFetchBoth(dashboard: DashboardResponse = mockDashboard) {
  return vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/record-types/') || urlStr.match(/\/api\/record-types\/[^?]+/)) {
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }
    if (urlStr.includes('/api/record-types')) {
      return Promise.resolve(new Response(JSON.stringify(mockRecordTypes), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }
    if (urlStr.includes('/api/unified/dashboard')) {
      return Promise.resolve(
        new Response(JSON.stringify(dashboard), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/matching/model-status')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockModelStatus), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/matching/retrain') || urlStr.includes('/api/matching/train-model')) {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    return Promise.resolve(new Response('Not found', { status: 404 }))
  })
}

function setupFetchDashboardOnly(dashboard: DashboardResponse = mockDashboard) {
  return vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/record-types/') || urlStr.match(/\/api\/record-types\/[^?]+/)) {
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }
    if (urlStr.includes('/api/record-types')) {
      return Promise.resolve(new Response(JSON.stringify(mockRecordTypes), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }
    if (urlStr.includes('/api/unified/dashboard')) {
      return Promise.resolve(
        new Response(JSON.stringify(dashboard), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    return Promise.resolve(new Response('Not found', { status: 404 }))
  })
}

describe('Dashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading skeleton while fetching', () => {
    setupAuthAs('admin')
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))
    render(<Dashboard />)

    // KPI section is rendered with placeholders, but the real "Overview" header
    // and stage labels haven't appeared yet
    expect(screen.queryByRole('heading', { name: /overview/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument()
  })

  it('renders the unified overview layout with populated dashboard data', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })

    expect(screen.getByTestId('dashboard-hero')).toBeInTheDocument()
    expect(screen.getByText('Pipeline')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '40% unified' })).toBeInTheDocument()
    expect(screen.getByText(/60 of 150 records/)).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-kpi-strip')).toBeInTheDocument()
    expect(screen.queryByText('Records staged')).not.toBeInTheDocument()
  })

  it('renders pipeline stage cards', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })

    // The 4-stage overview system map
    expect(screen.getByText('INGEST')).toBeInTheDocument()
    expect(screen.getByText('MATCH')).toBeInTheDocument()
    expect(screen.getByText('REVIEW')).toBeInTheDocument()
    expect(screen.getByText('UNIFY')).toBeInTheDocument()
  })

  it('renders next-action cards from populated dashboard data', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })

    expect(screen.getByText('Review 25 match candidates')).toBeInTheDocument()
    expect(screen.getByText('Resolve 1 failed upload')).toBeInTheDocument()
    expect(screen.getByText('Browse 60 unified records')).toBeInTheDocument()
  })

  it('renders curated activity with actor instead of raw entity names', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly({
      ...mockDashboard,
      recent_activity: [
        {
          id: 1,
          action: 'match_rejected',
          entity_type: 'match_candidate',
          entity_id: 20,
          entity_name: 'Noisy Candidate Name',
          details: { type: 'supplier', reviewed_by: 'reviewer' },
          created_at: '2026-05-15T10:00:00Z',
          kind: 'review',
          tone: 'warn',
          title: 'Rejected match candidate',
          subtitle: 'Supplier pipeline',
          actor: 'reviewer',
          href: '/review',
        },
      ],
    })
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })

    expect(screen.getByText('reviewer')).toBeInTheDocument()
    expect(screen.getByText('Rejected match candidate')).toBeInTheDocument()
    expect(screen.queryByText('Noisy Candidate Name')).not.toBeInTheDocument()
  })

  it('renders upload CTA through the same overview when no staged records exist', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly({
      uploads: { total_batches: 0, completed: 0, failed: 0, total_staged: 0 },
      matching: { total_candidates: 0, total_groups: 0, avg_confidence: null },
      review: { pending: 0, confirmed: 0, rejected: 0 },
      unified: { total_unified: 0, merged: 0, singletons: 0 },
      recent_activity: [],
    })
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })

    expect(screen.getByTestId('dashboard-hero')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '0% unified' })).toBeInTheDocument()
    expect(screen.getByText('Upload your first file')).toBeInTheDocument()
  })

  it('shows ML section for admin users', async () => {
    setupAuthAs('admin')
    setupFetchBoth()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })
    await waitFor(() => {
      expect(screen.getByText('ML & matching')).toBeInTheDocument()
    })
  })

  it('hides ML section for non-admin users', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })
    expect(screen.queryByText('ML & matching')).not.toBeInTheDocument()
  })

  it('sends type param to dashboard endpoint', async () => {
    setupAuthAs('viewer')
    const fetchSpy = setupFetchDashboardOnly()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })

    const dashboardCall = (fetchSpy as unknown as ReturnType<typeof vi.spyOn>).mock?.calls?.find(
      ([url]: [unknown]) => String(url).includes('/api/unified/dashboard'),
    )
    expect(String(dashboardCall?.[0])).toContain('type=supplier')
  })

  it('passes type query param when triggering the retrain mutation', async () => {
    setupAuthAs('admin')
    const fetchSpy = setupFetchBoth()
    render(<Dashboard />)

    // Wait for the ML panel to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retrain weights/i })).toBeInTheDocument()
    })

    // Click "Retrain weights" → opens confirmation
    fireEvent.click(screen.getByRole('button', { name: /retrain weights/i }))

    // Click "Confirm" → fires the mutation
    fireEvent.click(await screen.findByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      const retrainCall = (fetchSpy as unknown as ReturnType<typeof vi.spyOn>).mock?.calls?.find(
        ([url]: [unknown]) => String(url).includes('/api/matching/retrain'),
      )
      expect(retrainCall).toBeDefined()
      expect(String(retrainCall?.[0])).toContain('type=supplier')
    })
  })
})
