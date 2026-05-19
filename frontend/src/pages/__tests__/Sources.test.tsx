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

const bankRecordType = {
  key: 'bank',
  label: 'Bank',
  fields: [
    { key: 'bank_name', label: 'Bank Name', role: 'name', required: true },
    { key: 'short_name', label: 'Short Name', role: 'extra', required: false },
    { key: 'bic', label: 'BIC / SWIFT', role: 'code', required: false },
    { key: 'iban', label: 'IBAN', role: 'code', required: false },
    { key: 'city', label: 'City', role: 'extra', required: false },
    { key: 'country', label: 'Country', role: 'enum', required: false },
  ],
  signals: [],
}

const source: DataSource = {
  id: 1,
  name: 'SAP Vendors',
  type: 'supplier',
  description: 'ERP export',
  delimiter: ';',
  column_mapping: { supplier_name: 'Vendor Name' },
  identity_field_key: 'supplier_name',
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
      if (url.endsWith('/api/record-types')) {
        return new Response(JSON.stringify({ types: mockTypes }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/record-types/supplier')) {
        return new Response(JSON.stringify(recordType), { headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/api/record-types/bank')) {
        return new Response(JSON.stringify(bankRecordType), { headers: { 'Content-Type': 'application/json' } })
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

  it('shows the source type as a group header', async () => {
    render(<Sources />)

    await screen.findByText('SAP Vendors')

    expect(screen.getByText('Supplier')).toBeInTheDocument()
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
    // shadcn Select renders a combobox button displaying the selected label (not a native <select>)
    expect(await screen.findByRole('combobox')).toHaveTextContent('Supplier')

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

  it('does not show source edit controls', async () => {
    render(<Sources />)

    await screen.findByText('SAP Vendors')

    expect(screen.queryByRole('button', { name: /edit sap vendors/i })).not.toBeInTheDocument()
  })

  it('ignores stale mapping keys that are not in the current record type when displaying mapped count', async () => {
    mockTypes = [
      { key: 'supplier', label: 'Supplier', field_count: 2 },
      { key: 'bank', label: 'Bank', field_count: 6 },
    ]
    mockSources = [{
      ...source,
      name: 'Banks EOT',
      type: 'bank',
      column_mapping: {
        bank_name: 'DES_0',
        iban: 'IBACOD_0',
        phone: 'TEL_0',
        website: 'WEB_0',
      },
    }]
    render(<Sources />)

    await screen.findByText('Banks EOT')
    await waitFor(() => {
      expect(screen.getByText('2 / 6')).toBeInTheDocument()
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
      expect(mappedCell.className).toMatch(/text-amber/)
    })
  })
})
