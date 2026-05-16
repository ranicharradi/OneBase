import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DataSource } from '../../api/types'
import { render } from '../../test/test-utils'
import Sources from '../Sources'

const recordType = {
  key: 'supplier',
  label: 'Supplier',
  fields: [
    { key: 'supplier_name', label: 'Supplier Name', role: 'name', required: true },
    { key: 'tax_id', label: 'Tax ID', role: 'code', required: false },
  ],
  signals: [],
}

const source: DataSource = {
  id: 1,
  name: 'SAP Vendors',
  type: 'supplier',
  description: 'ERP export',
  file_format: 'csv',
  delimiter: ';',
  column_mapping: { supplier_name: 'Vendor Name' },
  created_at: '2026-05-01T12:00:00Z',
  updated_at: '2026-05-01T12:00:00Z',
}

describe('Sources page record types', () => {
  let requests: Array<{ url: string; method: string; body?: unknown }>
  let mockTypes: Array<{ key: string; label: string; field_count: number }>
  let mockSources: DataSource[]

  beforeEach(() => {
    requests = []
    mockTypes = [{ key: 'supplier', label: 'Supplier', field_count: 2 }]
    mockSources = [source]
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      requests.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })

      if (url.endsWith('/api/sources') && method === 'GET') {
        return new Response(JSON.stringify(mockSources), { headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/api/sources') && method === 'POST') {
        return new Response(JSON.stringify({ ...source, ...(requests.at(-1)?.body as object), id: 2 }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/sources/1') && method === 'PUT') {
        return new Response(JSON.stringify({ ...source, ...(requests.at(-1)?.body as object) }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/record-types')) {
        return new Response(JSON.stringify({ types: mockTypes }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/record-types/supplier')) {
        return new Response(JSON.stringify(recordType), { headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/api/import/batches')) {
        return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('not found', { status: 404 })
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the source type in each source row', async () => {
    render(<Sources />)

    await screen.findByText('SAP Vendors')

    expect(screen.getByText('supplier')).toBeInTheDocument()
  })

  it('frames empty sources as record unification setup', async () => {
    mockSources = []

    render(<Sources />)

    expect(await screen.findByText('No data sources yet')).toBeInTheDocument()
    expect(screen.getByText('Create your first data source to begin mapping records for unification.')).toBeInTheDocument()
  })

  it('creates a source with the selected type and required field mapping', async () => {
    const user = userEvent.setup()
    render(<Sources />)

    await user.click(await screen.findByRole('button', { name: /new source/i }))
    expect(await screen.findByRole('combobox')).toHaveValue('supplier')

    await user.type(screen.getByPlaceholderText(/sap vendor export/i), 'Oracle Vendors')
    await user.type(screen.getByPlaceholderText(/csv column for supplier name/i), 'Vendor Name')
    await user.click(screen.getByRole('button', { name: /create source/i }))

    await waitFor(() => {
      const post = requests.find(req => req.url.endsWith('/api/sources') && req.method === 'POST')
      expect(post?.body).toMatchObject({
        name: 'Oracle Vendors',
        type: 'supplier',
        column_mapping: { supplier_name: 'Vendor Name' },
      })
    })
  })

  it('updates a source without sending the locked type', async () => {
    const user = userEvent.setup()
    render(<Sources />)

    await screen.findByText('SAP Vendors')
    await user.click(screen.getByRole('button', { name: /edit sap vendors/i }))
    expect(screen.getByDisplayValue('supplier')).toBeDisabled()

    await user.clear(screen.getByPlaceholderText(/sap vendor export/i))
    await user.type(screen.getByPlaceholderText(/sap vendor export/i), 'SAP Supplier Export')
    await user.click(screen.getByRole('button', { name: /update source/i }))

    await waitFor(() => {
      const put = requests.find(req => req.url.endsWith('/api/sources/1') && req.method === 'PUT')
      expect(put?.body).toMatchObject({ name: 'SAP Supplier Export' })
      expect(put?.body).not.toHaveProperty('type')
    })
  })

  it('sends null values when clearing editable optional fields', async () => {
    mockSources = [{
      ...source,
      description: 'ERP export',
    }]
    const user = userEvent.setup()
    render(<Sources />)

    await screen.findByText('SAP Vendors')
    await user.click(screen.getByRole('button', { name: /edit sap vendors/i }))
    await user.clear(screen.getByPlaceholderText(/optional description/i))
    await user.click(screen.getByRole('button', { name: /update source/i }))

    await waitFor(() => {
      const put = requests.find(req => req.url.endsWith('/api/sources/1') && req.method === 'PUT')
      expect(put?.body).toMatchObject({
        description: null,
      })
    })
  })

  it('disables source creation when no record types are available', async () => {
    mockTypes = []

    render(<Sources />)

    await screen.findByText('SAP Vendors')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /new source/i })).toBeDisabled()
    })
  })

  it('marks mapped counts as incomplete when required fields are missing', async () => {
    mockSources = [{
      ...source,
      column_mapping: { tax_id: 'Tax Number' },
    }]

    render(<Sources />)

    const mappedCell = await screen.findByText('1 / 2')
    await waitFor(() => {
      expect(mappedCell).toHaveStyle({ color: 'var(--warn)' })
    })
  })
})
