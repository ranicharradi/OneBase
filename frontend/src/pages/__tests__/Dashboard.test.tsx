import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
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

// ── Mock data ──────────────────────────────────────────────────────────

const mockDashboard: DashboardResponse = {
  uploads: { total_batches: 5, completed: 4, failed: 1, total_staged: 150 },
  matching: { total_candidates: 80, total_groups: 25, avg_confidence: 0.78 },
  review: { pending: 25, confirmed: 40, rejected: 10, skipped: 5 },
  unified: { total_unified: 60, merged: 45, singletons: 15 },
  recent_activity: [],
}

const mockModelStatus: ModelStatusResponse = {
  last_retrained: '2026-03-28T10:00:00Z',
  last_trained: '2026-03-27T08:00:00Z',
  review_count: 55,
  current_weights: { jaro_winkler: 0.30, token_jaccard: 0.20, embedding_cosine: 0.25 },
  ml_model_exists: true,
}

// ── Helpers ────────────────────────────────────────────────────────────

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

function setupFetchBoth() {
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    if (String(url).includes('/api/unified/dashboard')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockDashboard), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (String(url).includes('/api/matching/model-status')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockModelStatus), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    return Promise.resolve(new Response('Not found', { status: 404 }))
  })
}

function setupFetchDashboardOnly() {
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    if (String(url).includes('/api/unified/dashboard')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockDashboard), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    return Promise.resolve(new Response('Not found', { status: 404 }))
  })
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('Dashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state (shimmer skeleton) while fetching', () => {
    setupAuthAs('admin')
    // Return a promise that never resolves so we stay in loading state
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))

    render(<Dashboard />)

    // While loading, the pipeline card labels should not be present
    expect(screen.queryByText('Ingestion')).not.toBeInTheDocument()
    expect(screen.queryByText('Matching')).not.toBeInTheDocument()
    expect(screen.queryByText('Review')).not.toBeInTheDocument()
    expect(screen.queryByText('Unified')).not.toBeInTheDocument()

    // The skeleton renders animate-pulse elements
    const pulseElements = document.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('renders stat cards with correct values after data loads', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()

    render(<Dashboard />)

    // Wait for pipeline cards to appear
    await screen.findByText('Ingestion')

    // Scope assertions to specific pipeline cards via their label
    const ingestionCard = screen.getByText('Ingestion').closest('div[class*="card"]')!
    expect(within(ingestionCard as HTMLElement).getByText('1 failed')).toBeInTheDocument()

    const reviewCard = screen.getByText('Review').closest('div[class*="card"]')!
    expect(within(reviewCard as HTMLElement).getByText('pending review')).toBeInTheDocument()

    const unifiedCard = screen.getByText('Unified').closest('div[class*="card"]')!
    expect(within(unifiedCard as HTMLElement).getByText('60')).toBeInTheDocument()
  })

  it('renders pipeline stage cards', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()

    render(<Dashboard />)

    // All four pipeline stage labels must appear (case-sensitive to avoid SVG text collision)
    await screen.findByText('Ingestion')
    expect(screen.getByText('Matching')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Unified')).toBeInTheDocument()
  })

  it('renders next-action cards when pending review exists', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()

    render(<Dashboard />)

    // Wait for data to load
    await screen.findByText('Ingestion')

    // review.pending = 25 → action card with this text
    expect(screen.getByText('Review 25 match candidates')).toBeInTheDocument()

    // uploads.failed = 1 → action card with this text
    expect(screen.getByText('Resolve 1 failed upload')).toBeInTheDocument()
  })

  it('shows ML section for admin users', async () => {
    setupAuthAs('admin')
    setupFetchBoth()

    render(<Dashboard />)

    // Wait for dashboard data then ML section
    await screen.findByText('Ingestion')

    await waitFor(() => {
      expect(screen.getByText('ML & Matching')).toBeInTheDocument()
    })
  })

  it('hides ML section for non-admin users', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()

    render(<Dashboard />)

    // Wait for data to load
    await screen.findByText('Ingestion')

    // ML section must not be visible for a viewer
    expect(screen.queryByText('ML & Matching')).not.toBeInTheDocument()
  })
})
