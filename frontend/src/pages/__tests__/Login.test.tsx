import { describe, it, expect, vi, type Mock } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import Login from '../Login'
import { useAuth } from '../../hooks/useAuth'

// Mock useAuth — avoid real AuthProvider which would make fetch calls
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// Mock useNavigate so we can assert navigation calls
const mockNavigate = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return { ...actual, useNavigate: () => mockNavigate }
})

function setupAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  const mockLogin = vi.fn().mockResolvedValue(undefined)
  ;(useAuth as Mock).mockReturnValue({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    login: mockLogin,
    logout: vi.fn(),
    ...overrides,
  })
  return mockLogin
}

describe('Login page', () => {
  it('renders username and password input fields', () => {
    setupAuth()
    render(<Login />)

    expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders "Sign in" submit button', () => {
    setupAuth()
    render(<Login />)

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('calls login with username and password on form submit', async () => {
    const mockLogin = setupAuth()
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'secret')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledOnce()
      expect(mockLogin).toHaveBeenCalledWith('admin', 'secret')
    })
  })

  it('shows "Signing in..." during submission', async () => {
    let resolveLogin!: () => void
    const pendingLogin = new Promise<void>((resolve) => {
      resolveLogin = resolve
    })
    setupAuth({ login: vi.fn().mockReturnValue(pendingLogin) })
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'secret')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // While the promise is still pending the button text changes
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument()
    })

    // Clean up — resolve so there are no open handles; wrap in act to flush
    // the resulting state update (isSubmitting → false)
    await act(async () => {
      resolveLogin()
    })
  })

  it('navigates to /dashboard on successful login', async () => {
    setupAuth()
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'secret')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
    })
  })

  it('displays error message on failed login', async () => {
    setupAuth({ login: vi.fn().mockRejectedValue(new Error('Invalid credentials')) })
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByRole('textbox', { name: /username/i }), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('clears error when re-submitting', async () => {
    const failingLogin = vi.fn().mockRejectedValue(new Error('Invalid credentials'))
    setupAuth({ login: failingLogin })
    const user = userEvent.setup()
    render(<Login />)

    // First submission — triggers an error
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'admin')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })

    // Update mock to succeed on the next attempt
    failingLogin.mockResolvedValueOnce(undefined)

    // Re-submit — error should be cleared before the new attempt resolves
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument()
    })
  })
})
