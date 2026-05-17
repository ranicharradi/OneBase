import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, ApiError, setToken, clearToken } from '../client'
import type {
  BulkPromoteRequest,
  BulkPromoteResponse,
  DataSource,
  DataSourceCreate,
  FieldSelection,
  MatchDetailResponse,
  PromoteResponse,
  RecordType,
  RecordTypeListResponse,
  ReviewActionResponse,
  ReviewQueueItem,
  SingletonListResponse,
  UnifiedRecordDetail,
  UnifiedRecordListResponse,
} from '../types'

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

// ── Record API contracts ─────────────────────────────────────────────────────

describe('record API type contracts', () => {
  it('accepts Phase 1 generic record payload shapes', () => {
    const recordType: RecordType = {
      key: 'supplier',
      label: 'Supplier',
      fields: [
        { key: 'name', label: 'Name', role: 'name', required: true },
        { key: 'email', label: 'Email', role: 'email', required: false },
      ],
      signals: [{ kind: 'exact', field: 'name', weight: 0.8 }],
    }
    const recordTypes: RecordTypeListResponse = {
      types: [{ key: recordType.key, label: recordType.label, field_count: recordType.fields.length }],
    }
    const dataSource: DataSource = {
      id: 1,
      name: 'ERP export',
      type: 'supplier',
      description: null,
      delimiter: ',',
      column_mapping: { name: 'Supplier Name', required: true, maxLength: 120 },
      created_at: null,
      updated_at: null,
    }
    const createSource: DataSourceCreate = {
      name: dataSource.name,
      type: dataSource.type,
      description: null,
      column_mapping: { name: 'Supplier Name' },
    }
    const matchDetail: MatchDetailResponse = {
      id: 10,
      type: 'supplier',
      match_run_id: 99,
      confidence: 0.92,
      match_signals: { name: 0.92 },
      status: 'pending',
      group_id: null,
      record_a: {
        id: 1,
        type: 'supplier',
        name: 'Acme',
        normalized_name: 'acme',
        fields: { email: 'a@example.com' },
        data_source_id: 1,
        data_source_name: 'ERP export',
        raw_data: null,
      },
      record_b: {
        id: 2,
        type: 'supplier',
        name: 'ACME Inc',
        normalized_name: 'acme inc',
        fields: { phone: '555-0100' },
        data_source_id: 1,
        data_source_name: 'ERP export',
        raw_data: { Name: 'ACME Inc' },
      },
      field_comparisons: [
        {
          field: 'name',
          label: 'Name',
          value_a: 'Acme',
          value_b: 'ACME Inc',
          source_a: 'ERP export',
          source_b: 'ERP export',
          is_conflict: true,
          is_identical: false,
          is_a_only: false,
          is_b_only: false,
        },
      ],
      reviewed_by: null,
      reviewed_at: null,
      created_at: null,
    }
    const queueItem: ReviewQueueItem = {
      id: matchDetail.id,
      type: matchDetail.type,
      record_a_id: matchDetail.record_a.id,
      record_b_id: matchDetail.record_b.id,
      record_a_name: matchDetail.record_a.name,
      record_b_name: matchDetail.record_b.name,
      record_a_source: matchDetail.record_a.data_source_name,
      record_b_source: matchDetail.record_b.data_source_name,
      record_a_fields: matchDetail.record_a.fields,
      record_b_fields: matchDetail.record_b.fields,
      confidence: matchDetail.confidence,
      match_signals: matchDetail.match_signals,
      status: matchDetail.status,
      group_id: null,
      created_at: null,
      reviewed_by: null,
      reviewed_at: null,
    }
    const selection: FieldSelection = { field: 'name', chosen_record_id: 1 }
    const actionResponse: ReviewActionResponse = {
      candidate_id: matchDetail.id,
      action: 'merge',
      unified_record_id: 100,
    }
    const unifiedRecords: UnifiedRecordListResponse = {
      items: [
        {
          id: 100,
          type: 'supplier',
          name: 'Acme',
          fields: { name: 'Acme' },
          source_count: 2,
          is_singleton: false,
          created_by: 'system',
          created_at: null,
        },
      ],
      total: 1,
      has_more: false,
    }
    const unifiedDetail: UnifiedRecordDetail = {
      id: 100,
      type: 'supplier',
      name: 'Acme',
      fields: { name: 'Acme' },
      provenance: {
        name: {
          value: 'Acme',
          source_entity: 'ERP export',
          source_record_id: 1,
          auto: true,
          chosen_by: null,
          chosen_at: null,
        },
      },
      source_record_ids: [1, 2],
      source_records: [
        {
          id: 1,
          type: 'supplier',
          name: 'Acme',
          fields: { name: 'Acme' },
          data_source_name: 'ERP export',
          data_source_id: 1,
        },
      ],
      match_candidate_id: matchDetail.id,
      merge_history: [{ id: 1, action: 'merge', details: null, created_at: null }],
      created_by: 'system',
      created_at: null,
    }
    const singletons: SingletonListResponse = {
      items: [
        {
          id: 3,
          type: 'supplier',
          name: null,
          fields: { code: 'S-3' },
          data_source_id: 1,
          data_source_name: null,
        },
      ],
      total: 1,
      has_more: false,
    }
    const promoteResponse: PromoteResponse = {
      unified_record_id: 101,
      record_name: 'Solo Supplier',
      message: 'Promoted',
    }
    const bulkRequest: BulkPromoteRequest = { record_ids: [3] }
    const bulkResponse: BulkPromoteResponse = { promoted_count: 1, unified_record_ids: [101] }

    expect({
      recordTypes,
      createSource,
      queueItem,
      selection,
      actionResponse,
      unifiedRecords,
      unifiedDetail,
      singletons,
      promoteResponse,
      bulkRequest,
      bulkResponse,
    }).toBeTruthy()
  })
})
