import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import Layout from '../Layout'

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { username: 'admin@example.com' },
    logout: vi.fn(),
  }),
}))

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    toggleTheme: vi.fn(),
  }),
}))

vi.mock('../../hooks/useMatchingNotifications', () => ({
  useMatchingNotifications: vi.fn(),
}))

function setupFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/record-types')) {
      return Promise.resolve(
        new Response(JSON.stringify({
          types: [
            { key: 'supplier', label: 'Supplier', field_count: 3 },
            { key: 'bank', label: 'Bank', field_count: 4 },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    if (urlStr.includes('/api/review/stats')) {
      return Promise.resolve(
        new Response(JSON.stringify({
          total_pending: 3,
          total_confirmed: 2,
          total_merged: 1,
          total_rejected: 0,
          total_unified: 4,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    return Promise.resolve(new Response('Not found', { status: 404 }))
  })
}

describe('Layout sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    setupFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('folds and expands each navigation group independently', async () => {
    render(<Layout />)

    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /pipeline/i }))

    expect(screen.queryByText('Overview')).not.toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pipeline/i })).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('button', { name: /pipeline/i }))

    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pipeline/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('admin access is not in the sidebar nav', () => {
    render(<Layout />)

    expect(screen.queryByRole('link', { name: /admin access/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /utilities/i })).toBeInTheDocument()
  })

  it('uses one global record type selector to scope lifecycle navigation', async () => {
    const user = userEvent.setup()
    render(<Layout />)

    const selector = await screen.findByRole('combobox', { name: /record type/i })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bank' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^bank$/i })).not.toBeInTheDocument()

    await user.selectOptions(selector, 'bank')

    expect(screen.getByRole('link', { name: /history/i })).toHaveAttribute('href', '/history')
    expect(screen.getByRole('link', { name: /review queue/i })).toHaveAttribute('href', '/review?type=bank')
    expect(screen.getByRole('link', { name: /merge queue/i })).toHaveAttribute('href', '/merge?type=bank')
    expect(screen.getByRole('link', { name: /unified/i })).toHaveAttribute('href', '/unified?type=bank')
  })
})
