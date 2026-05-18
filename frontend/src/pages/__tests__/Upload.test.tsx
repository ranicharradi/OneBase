import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../../test/test-utils'
import Upload from '../Upload'

const recordTypesResponse = {
  types: [{ key: 'supplier', label: 'Supplier', field_count: 1 }],
}

const supplierType = {
  key: 'supplier',
  label: 'Supplier',
  fields: [
    {
      key: 'supplier_name',
      label: 'Supplier Name',
      role: 'name',
      required: true,
      synonyms: ['Vendor Name'],
    },
  ],
  signals: [],
}

describe('Upload source creation from file preflight', () => {
  let requests: Array<{ url: string; method: string; body?: unknown }>

  beforeEach(() => {
    requests = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body instanceof FormData || init?.body == null
        ? init?.body
        : JSON.parse(String(init.body))
      requests.push({ url, method, body })

      if (url.endsWith('/api/sources') && method === 'GET') {
        return json([{
          id: 7,
          name: 'Industry A Suppliers',
          type: 'supplier',
          description: null,
          delimiter: ';',
          column_mapping: { supplier_name: 'Vendor Name' },
          identity_field_key: 'supplier_name',
          created_at: null,
          updated_at: null,
        }])
      }
      if (url.endsWith('/api/record-types') && method === 'GET') {
        return json(recordTypesResponse)
      }
      if (url.endsWith('/api/sources/detect-headers') && method === 'POST') {
        return json({ columns: ['Vendor Name'], delimiter: null, format: 'xlsx' })
      }
      if (url.endsWith('/api/record-types/supplier') && method === 'GET') {
        return json(supplierType)
      }
      if (url.endsWith('/api/sources') && method === 'POST') {
        return json({
          id: 2,
          name: 'Vendors',
          type: 'supplier',
          description: null,
          delimiter: ';',
          column_mapping: { supplier_name: 'Vendor Name' },
          created_at: null,
          updated_at: null,
        })
      }
      if (url.endsWith('/api/import/overlap-probe') && method === 'POST') {
        return json({ matches: [] })
      }
      if (url.endsWith('/api/import/upload') && method === 'POST') {
        return json({ batch_id: 10, task_id: 'task-10', filename: 'vendors.xlsx', message: 'ok' })
      }
      if (url.endsWith('/api/import/batches') && method === 'GET') {
        return json([])
      }
      if (url.endsWith('/api/import/batches/task-10/status') && method === 'GET') {
        return json({ task_id: 'task-10', state: 'COMPLETE', row_count: 1 })
      }
      return new Response('not found', { status: 404 })
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a source and uploads when submitting column mapping', async () => {
    const user = userEvent.setup()
    render(<Upload />)

    fireEvent.drop(await screen.findByRole('button', { name: /drop a csv or excel file/i }), {
      dataTransfer: {
        files: [new File(['xlsx bytes'], 'vendors.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })],
      },
    })

    await screen.findByText('Supplier Name')
    pickIdentityField()
    await user.click(screen.getByRole('button', { name: /create & upload/i }))

    await waitFor(() => {
      const post = requests.find(req => req.url.endsWith('/api/sources') && req.method === 'POST')
      expect(post?.body).toMatchObject({ name: 'Vendors', type: 'supplier' })
    })
  })

  it('shows overlap matches before creating a new source', async () => {
    const user = userEvent.setup()
    const uploadedFile = new File(['Vendor Name\nAcme'], 'industry-b-suppliers.csv', { type: 'text/csv' })
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body instanceof FormData || init?.body == null
        ? init?.body
        : JSON.parse(String(init.body))
      requests.push({ url, method, body })

      if (url.endsWith('/api/sources') && method === 'GET') {
        return json([{
          id: 7,
          name: 'Industry A Suppliers',
          type: 'supplier',
          description: null,
          delimiter: ';',
          column_mapping: { supplier_name: 'Vendor Name' },
          identity_field_key: 'supplier_name',
          created_at: null,
          updated_at: null,
        }])
      }
      if (url.endsWith('/api/record-types') && method === 'GET') {
        return json(recordTypesResponse)
      }
      if (url.endsWith('/api/sources/detect-headers') && method === 'POST') {
        return json({ columns: ['Vendor Name'], delimiter: ';', format: 'csv' })
      }
      if (url.endsWith('/api/record-types/supplier') && method === 'GET') {
        return json(supplierType)
      }
      if (url.endsWith('/api/import/overlap-probe') && method === 'POST') {
        return json({
          matches: [{
            source_id: 7,
            source_name: 'Industry A Suppliers',
            overlap_ratio: 0.88,
            matched_count: 22,
            total_count: 25,
          }],
        })
      }
      if (url.endsWith('/api/import/batches?data_source_id=7') && method === 'GET') {
        return json([{ id: 10, data_source_id: 7, filename: 'previous.csv' }])
      }
      if (url.endsWith('/api/import/preview') && method === 'POST') {
        return json({ inserted: 1, updated: 2, retired: 3, unchanged: 4 })
      }
      return new Response('not found', { status: 404 })
    })

    render(<Upload />)

    fireEvent.drop(await screen.findByRole('button', { name: /drop a csv or excel file/i }), {
      dataTransfer: {
        files: [uploadedFile],
      },
    })

    await screen.findByText('Supplier Name')
    pickIdentityField()
    await user.click(screen.getByRole('button', { name: /create & upload/i }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('Industry A Suppliers')
    expect(screen.getByText('88%')).toBeInTheDocument()
    expect(requests.some(req => req.url.endsWith('/api/sources') && req.method === 'POST')).toBe(false)

    await user.click(screen.getByRole('button', { name: /re-upload to industry a suppliers/i }))

    expect(await screen.findByText('Re-upload preview')).toBeInTheDocument()
    const preview = requests.find(req => req.url.endsWith('/api/import/preview') && req.method === 'POST')
    expect((preview?.body as FormData | undefined)?.get('file')).toBe(uploadedFile)
    expect((preview?.body as FormData | undefined)?.get('data_source_id')).toBe('7')

    expect(await screen.findByText(/Upload to/i)).toHaveTextContent('Industry A Suppliers')
  })

  it('does not submit a second overlap probe while the first probe is pending', async () => {
    const user = userEvent.setup()
    const probeResolvers: Array<(response: Response) => void> = []
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body instanceof FormData || init?.body == null
        ? init?.body
        : JSON.parse(String(init.body))
      requests.push({ url, method, body })

      if (url.endsWith('/api/sources') && method === 'GET') {
        return json([])
      }
      if (url.endsWith('/api/record-types') && method === 'GET') {
        return json(recordTypesResponse)
      }
      if (url.endsWith('/api/sources/detect-headers') && method === 'POST') {
        return json({ columns: ['Vendor Name'], delimiter: ';', format: 'csv' })
      }
      if (url.endsWith('/api/record-types/supplier') && method === 'GET') {
        return json(supplierType)
      }
      if (url.endsWith('/api/import/overlap-probe') && method === 'POST') {
        return new Promise<Response>((resolve) => {
          probeResolvers.push(resolve)
        })
      }
      if (url.endsWith('/api/sources') && method === 'POST') {
        return json({
          id: 2,
          name: 'Vendors',
          type: 'supplier',
          description: null,
          delimiter: ';',
          column_mapping: { supplier_name: 'Vendor Name' },
          identity_field_key: 'supplier_name',
          created_at: null,
          updated_at: null,
        })
      }
      if (url.endsWith('/api/import/upload') && method === 'POST') {
        return json({ batch_id: 10, task_id: 'task-10', filename: 'vendors.csv', message: 'ok' })
      }
      return new Response('not found', { status: 404 })
    })

    render(<Upload />)

    fireEvent.drop(await screen.findByRole('button', { name: /drop a csv or excel file/i }), {
      dataTransfer: {
        files: [new File(['Vendor Name\nAcme'], 'vendors.csv', { type: 'text/csv' })],
      },
    })

    await screen.findByText('Supplier Name')
    pickIdentityField()
    await user.dblClick(screen.getByRole('button', { name: /create & upload/i }))

    await waitFor(() => {
      expect(requests.filter(req => req.url.endsWith('/api/import/overlap-probe')).length).toBe(1)
    })

    probeResolvers.forEach(resolve => resolve(json({ matches: [] })))

    await waitFor(() => {
      expect(requests.filter(req => req.url.endsWith('/api/sources') && req.method === 'POST')).toHaveLength(1)
    })
  })

  it('continues creating a new source when the overlap probe fails', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = init?.body instanceof FormData || init?.body == null
        ? init?.body
        : JSON.parse(String(init.body))
      requests.push({ url, method, body })

      if (url.endsWith('/api/sources') && method === 'GET') {
        return json([])
      }
      if (url.endsWith('/api/record-types') && method === 'GET') {
        return json(recordTypesResponse)
      }
      if (url.endsWith('/api/sources/detect-headers') && method === 'POST') {
        return json({ columns: ['Vendor Name'], delimiter: ';', format: 'csv' })
      }
      if (url.endsWith('/api/record-types/supplier') && method === 'GET') {
        return json(supplierType)
      }
      if (url.endsWith('/api/import/overlap-probe') && method === 'POST') {
        return new Response('probe unavailable', { status: 503 })
      }
      if (url.endsWith('/api/sources') && method === 'POST') {
        return json({
          id: 2,
          name: 'Vendors',
          type: 'supplier',
          description: null,
          delimiter: ';',
          column_mapping: { supplier_name: 'Vendor Name' },
          identity_field_key: 'supplier_name',
          created_at: null,
          updated_at: null,
        })
      }
      if (url.endsWith('/api/import/upload') && method === 'POST') {
        return json({ batch_id: 10, task_id: 'task-10', filename: 'vendors.csv', message: 'ok' })
      }
      if (url.endsWith('/api/import/batches/task-10/status') && method === 'GET') {
        return json({ task_id: 'task-10', state: 'COMPLETE', row_count: 1 })
      }
      return new Response('not found', { status: 404 })
    })

    render(<Upload />)

    fireEvent.drop(await screen.findByRole('button', { name: /drop a csv or excel file/i }), {
      dataTransfer: {
        files: [new File(['Vendor Name\nAcme'], 'vendors.csv', { type: 'text/csv' })],
      },
    })

    await screen.findByText('Supplier Name')
    pickIdentityField()
    await user.click(screen.getByRole('button', { name: /create & upload/i }))

    await waitFor(() => {
      const post = requests.find(req => req.url.endsWith('/api/sources') && req.method === 'POST')
      expect(post?.body).toMatchObject({ name: 'Vendors', type: 'supplier' })
    })
  })
})

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
}

function pickIdentityField(): void {
  const identitySelect = screen.getByDisplayValue('— pick the column that uniquely identifies a row —')
  fireEvent.change(identitySelect, { target: { value: 'supplier_name' } })
}
