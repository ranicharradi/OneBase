import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from '../useAuth'

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 1,
  username: 'testuser',
  is_active: true,
  role: 'admin',
  created_at: '2024-01-01T00:00:00Z',
}

function makeFetchOk(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function makeFetchError(status: number, detail = 'error') {
  return Promise.resolve(
    new Response(JSON.stringify({ detail }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('location', { ...window.location, href: '' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── AuthProvider ─────────────────────────────────────────────────────────────

describe('AuthProvider', () => {
  it('renders children', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })
    // If AuthProvider didn't render, useAuth would throw. Reaching here means children rendered.
    expect(result.current).toBeDefined()
  })

  it('starts with isLoading=true when token exists in localStorage', async () => {
    localStorage.setItem('onebase_token', 'existing-token')
    vi.spyOn(global, 'fetch').mockReturnValue(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })
    // Synchronously true before the /me fetch resolves
    expect(result.current.isLoading).toBe(true)
    // Drain pending state updates so act() warnings don't bleed into output
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('starts with isLoading=false when no token', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isLoading).toBe(false)
  })

  it('fetches /api/auth/me on mount when token exists', async () => {
    localStorage.setItem('onebase_token', 'existing-token')
    const fetchSpy = vi.spyOn(global, 'fetch').mockReturnValue(makeFetchOk(mockUser))

    renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/me'),
        expect.any(Object),
      )
    })
  })

  it('sets user from /api/auth/me response', async () => {
    localStorage.setItem('onebase_token', 'existing-token')
    vi.spyOn(global, 'fetch').mockReturnValue(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('clears token and sets user=null when /api/auth/me fails', async () => {
    localStorage.setItem('onebase_token', 'bad-token')
    vi.spyOn(global, 'fetch').mockReturnValue(makeFetchError(401, 'Unauthorized'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(localStorage.getItem('onebase_token')).toBeNull()
    expect(window.location.href).toBe('/login')
  })
})

// ── login ─────────────────────────────────────────────────────────────────────

describe('login', () => {
  it('calls /api/auth/login with form-encoded username/password', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeFetchOk({ access_token: 'new-token' }))
      .mockReturnValueOnce(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('alice', 'secret')
    })

    const loginCall = fetchSpy.mock.calls[0]
    expect(loginCall[0]).toContain('/api/auth/login')
    const init = loginCall[1] as RequestInit
    expect(init.method).toBe('POST')
    // Body must be URLSearchParams-encoded
    const body = init.body as URLSearchParams
    expect(body.get('username')).toBe('alice')
    expect(body.get('password')).toBe('secret')
  })

  it('stores token in localStorage on success', async () => {
    vi.spyOn(global, 'fetch')
      .mockReturnValueOnce(makeFetchOk({ access_token: 'saved-token' }))
      .mockReturnValueOnce(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('alice', 'secret')
    })

    expect(localStorage.getItem('onebase_token')).toBe('saved-token')
  })

  it('fetches /api/auth/me after storing token', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeFetchOk({ access_token: 'new-token' }))
      .mockReturnValueOnce(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('alice', 'secret')
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const meCall = fetchSpy.mock.calls[1]
    expect(meCall[0]).toContain('/api/auth/me')
  })

  it('sets user and isAuthenticated=true on success', async () => {
    vi.spyOn(global, 'fetch')
      .mockReturnValueOnce(makeFetchOk({ access_token: 'new-token' }))
      .mockReturnValueOnce(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login('alice', 'secret')
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('throws on login failure (does not set user)', async () => {
    vi.spyOn(global, 'fetch').mockReturnValueOnce(makeFetchError(401, 'Invalid credentials'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await expect(
      act(async () => {
        await result.current.login('alice', 'wrongpassword')
      }),
    ).rejects.toThrow('Unauthorized')

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })
})

// ── logout ────────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('clears token from localStorage', async () => {
    localStorage.setItem('onebase_token', 'existing-token')
    vi.spyOn(global, 'fetch').mockReturnValue(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
    })

    act(() => {
      result.current.logout()
    })

    expect(localStorage.getItem('onebase_token')).toBeNull()
  })

  it('sets user to null', async () => {
    localStorage.setItem('onebase_token', 'existing-token')
    vi.spyOn(global, 'fetch').mockReturnValue(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
    })

    act(() => {
      result.current.logout()
    })

    expect(result.current.user).toBeNull()
  })

  it('sets isAuthenticated to false', async () => {
    localStorage.setItem('onebase_token', 'existing-token')
    vi.spyOn(global, 'fetch').mockReturnValue(makeFetchOk(mockUser))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true)
    })

    act(() => {
      result.current.logout()
    })

    expect(result.current.isAuthenticated).toBe(false)
  })
})

// ── useAuth outside provider ──────────────────────────────────────────────────

describe('useAuth outside provider', () => {
  it('throws "must be used within an AuthProvider"', () => {
    // Suppress React's console.error for expected throw
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within an AuthProvider',
    )

    consoleSpy.mockRestore()
  })
})
