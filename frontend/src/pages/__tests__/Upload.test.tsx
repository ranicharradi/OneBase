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
        return json([])
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
