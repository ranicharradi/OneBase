import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError, setToken, clearToken } from '../client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(body: unknown, status = 200): Promise<Response> {
  const isString = typeof body === 'string'
  return Promise.resolve(
    new Response(isString ? body : JSON.stringify(body), {
      status,
      headers: isString ? {} : { 'Content-Type': 'application/json' },
    }),
  )
}

function makeEmptyResponse(status: number): Promise<Response> {
  return Promise.resolve(new Response(null, { status }))
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('location', { ...window.location, href: '' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── ApiError ──────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('has name "ApiError"', () => {
    const err = new ApiError(404, 'Not found')
    expect(err.name).toBe('ApiError')
  })

  it('has status property', () => {
    const err = new ApiError(422, 'Unprocessable')
    expect(err.status).toBe(422)
  })

  it('has message property', () => {
    const err = new ApiError(500, 'Internal server error')
    expect(err.message).toBe('Internal server error')
  })
})

// ── api.get ───────────────────────────────────────────────────────────────────

describe('api.get', () => {
  it('sends GET request with Authorization header when token exists', async () => {
    setToken('test-token')
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ ok: true }))

    await api.get('/api/test')

    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-token')
  })

  it('sends GET request without Authorization header when no token', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ ok: true }))

    await api.get('/api/test')

    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.get('Authorization')).toBeNull()
  })

  it('returns parsed JSON body', async () => {
    vi.spyOn(global, 'fetch').mockReturnValueOnce(makeResponse({ name: 'Acme Corp', id: 42 }))

    const result = await api.get<{ name: string; id: number }>('/api/suppliers/42')

    expect(result).toEqual({ name: 'Acme Corp', id: 42 })
  })

  it('throws ApiError with status on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockReturnValueOnce(makeResponse('Not Found', 404))

    await expect(api.get('/api/missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    })
  })

  it('throws ApiError with detail message from JSON error body', async () => {
    vi.spyOn(global, 'fetch').mockReturnValueOnce(
      makeResponse({ detail: 'Supplier not found' }, 404),
    )

    await expect(api.get('/api/suppliers/999')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Supplier not found',
    })
  })
})

// ── api.post ──────────────────────────────────────────────────────────────────

describe('api.post', () => {
  it('sends POST with JSON body and Content-Type application/json', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ created: true }))

    await api.post('/api/suppliers', { name: 'Acme' })

    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init?.body).toBe(JSON.stringify({ name: 'Acme' }))
  })

  it('sends POST without body when body is undefined', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ ok: true }))

    await api.post('/api/action')

    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeUndefined()
  })
})

// ── api.put ──────────────────────────────────────────────────────────────────

describe('api.put', () => {
  it('sends PUT with JSON body and Content-Type application/json', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ updated: true }))

    await api.put('/api/sources/1', { name: 'Updated' })

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/sources/1')
    expect(init?.method).toBe('PUT')
    const headers = init?.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init?.body).toBe(JSON.stringify({ name: 'Updated' }))
  })
})

// ── api.formPost ──────────────────────────────────────────────────────────────

describe('api.formPost', () => {
  it('sends POST with application/x-www-form-urlencoded Content-Type', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ access_token: 'tok' }))

    await api.formPost('/api/auth/login', { username: 'alice', password: 'secret' })

    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded')
  })

  it('sends URL-encoded params in body', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ access_token: 'tok' }))

    await api.formPost('/api/auth/login', { username: 'alice', password: 'secret' })

    const [, init] = fetchSpy.mock.calls[0]
    const body = init?.body as URLSearchParams
    expect(body.get('username')).toBe('alice')
    expect(body.get('password')).toBe('secret')
  })
})

// ── api.upload ────────────────────────────────────────────────────────────────

describe('api.upload', () => {
  it('sends POST with FormData body', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ task_id: 'abc123' }))

    const formData = new FormData()
    formData.append('file', new Blob(['csv content'], { type: 'text/csv' }), 'data.csv')

    await api.upload('/api/upload', formData)

    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(formData)
  })

  it('does NOT set Content-Type header (browser sets multipart boundary)', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ task_id: 'abc123' }))

    const formData = new FormData()
    formData.append('file', new Blob(['csv'], { type: 'text/csv' }), 'data.csv')

    await api.upload('/api/upload', formData)

    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.get('Content-Type')).toBeNull()
  })
})

// ── api.delete ───────────────────────────────────────────────────────────────

describe('api.delete', () => {
  it('sends DELETE request to the given URL', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeEmptyResponse(204))

    await api.delete('/api/suppliers/42')

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/suppliers/42')
    expect(init?.method).toBe('DELETE')
  })
})

// ── 401 handling ──────────────────────────────────────────────────────────────

describe('401 handling', () => {
  it('clears token from localStorage on 401', async () => {
    setToken('stale-token')
    vi.spyOn(global, 'fetch').mockReturnValueOnce(makeEmptyResponse(401))

    await expect(api.get('/api/protected')).rejects.toMatchObject({ status: 401 })

    expect(localStorage.getItem('onebase_token')).toBeNull()
  })

  it('sets window.location.href to /login', async () => {
    vi.spyOn(global, 'fetch').mockReturnValueOnce(makeEmptyResponse(401))

    await expect(api.get('/api/protected')).rejects.toMatchObject({ status: 401 })

    expect(window.location.href).toBe('/login')
  })

  it('throws ApiError with status 401', async () => {
    vi.spyOn(global, 'fetch').mockReturnValueOnce(makeEmptyResponse(401))

    await expect(api.get('/api/protected')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Unauthorized',
    })
  })
})

// ── 204 handling ──────────────────────────────────────────────────────────────

describe('204 handling', () => {
  it('returns undefined for 204 No Content responses', async () => {
    vi.spyOn(global, 'fetch').mockReturnValueOnce(makeEmptyResponse(204))

    const result = await api.delete('/api/suppliers/1')

    expect(result).toBeUndefined()
  })
})

// ── token management ──────────────────────────────────────────────────────────

describe('token management', () => {
  it('setToken stores token in localStorage', () => {
    setToken('my-jwt-token')
    expect(localStorage.getItem('onebase_token')).toBe('my-jwt-token')
  })

  it('clearToken removes token from localStorage', () => {
    setToken('my-jwt-token')
    clearToken()
    expect(localStorage.getItem('onebase_token')).toBeNull()
  })

  it('includes updated token after setToken call', async () => {
    // Start with no token, then set one, then check it's included
    setToken('fresh-token')
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(makeResponse({ ok: true }))

    await api.get('/api/test')

    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer fresh-token')
  })
})
