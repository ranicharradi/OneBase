import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
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
  last_retrained: '2026-03-28T10:00:00Z',
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
    expect(document.querySelector('.kpi-grid')).toBeInTheDocument()
  })

  it('renders KPI cards with correct values after data loads', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })

    // KPI labels match the new design
    expect(screen.getByText('Records staged')).toBeInTheDocument()
    expect(screen.getByText('Unified records')).toBeInTheDocument()
    expect(screen.getByText('Pending review')).toBeInTheDocument()
    expect(screen.getByText('Avg confidence')).toBeInTheDocument()

    // Values from mock data — scope to KPI value cells specifically
    const kpiValues = Array.from(document.querySelectorAll('.kpi-value')).map(
      el => el.textContent?.trim(),
    )
    expect(kpiValues).toEqual(['150', '60', '25', '0.780'])
  })

  it('renders pipeline stage cards', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })

    // The 4-stage pipeline strip
    expect(screen.getByText('Ingest')).toBeInTheDocument()
    expect(screen.getByText('Match')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Unify')).toBeInTheDocument()
  })

  it('renders next-action cards when pending review exists', async () => {
    setupAuthAs('viewer')
    setupFetchDashboardOnly()
    render(<Dashboard />)

    await screen.findByRole('heading', { name: /overview/i })

    expect(screen.getByText('Review 25 match candidates')).toBeInTheDocument()
    expect(screen.getByText('Resolve 1 failed upload')).toBeInTheDocument()
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
})
