import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import UnifiedSuppliers from '../UnifiedSuppliers'
import { useAuth } from '../../hooks/useAuth'
import type { Mock } from 'vitest'

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return { ...actual, useNavigate: () => vi.fn() }
})

function mockAuthUser() {
  ;(useAuth as Mock).mockReturnValue({
    user: { id: 1, username: 'admin', is_active: true, role: 'admin', created_at: '2026-01-01T00:00:00Z' },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

const emptyList = { items: [], total: 0, has_more: false }

describe('UnifiedSuppliers export', () => {
  beforeEach(() => {
    mockAuthUser()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('includes active date filter params in the export fetch URL', async () => {
    const user = userEvent.setup()
    let capturedUrl: string | null = null

    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.includes('/api/unified/export')) {
        capturedUrl = url
        return Promise.resolve(
          new Response('ID,Name\n1,Test Corp', {
            status: 200,
            headers: { 'Content-Type': 'text/csv' },
          }),
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify(emptyList), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    render(<UnifiedSuppliers />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-03-31' } })

    await user.click(screen.getByRole('button', { name: /export/i }))

    await waitFor(() => {
      expect(capturedUrl).not.toBeNull()
      expect(capturedUrl).toContain('from_date=2026-01-01')
      expect(capturedUrl).toContain('to_date=2026-03-31')
    })
  })
})
