import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { render } from '../../test/test-utils'
import FileChecker from '../FileChecker'
import type { FileCheckReport, FileCheckReportDetail, FileCheckReportListResponse } from '../../api/types'

describe('FileChecker page', () => {
  const baseReport: FileCheckReport = {
    id: 42,
    original_filename: 'vendors.csv',
    file_size_bytes: 128,
    delimiter: ',',
    status: 'warning',
    total_rows: 12,
    rows_with_issues: 1,
    empty_row_count: 0,
    missing_value_count: 1,
    corrupted_value_count: 0,
    stored_issue_count: 1,
    issue_cap_reached: false,
    criteria_version: 'v1',
    error_message: null,
    checked_by: 'rani',
    created_at: '2026-05-03T10:00:00Z',
    completed_at: '2026-05-03T10:00:01Z',
  }

  const baseDetail: FileCheckReportDetail = {
    ...baseReport,
    issues: [
      {
        id: 9,
        report_id: 42,
        row_number: 7,
        column_name: 'supplier_name',
        issue_type: 'missing_value',
        severity: 'error',
        value_preview: null,
        message: 'Required value is missing',
        created_at: '2026-05-03T10:00:01Z',
      },
    ],
    issue_total: 1,
    issue_limit: 100,
    issue_offset: 0,
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  const mockFetch = ({
    history = { items: [], total: 0 },
    postReport = baseReport,
    details = { 42: baseDetail },
    postError,
    historyStatus = 200,
  }: {
    history?: FileCheckReportListResponse
    postReport?: FileCheckReport
    details?: Record<number, FileCheckReportDetail>
    postError?: string
    historyStatus?: number
  } = {}) => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url, init) => {
      const path = String(url)
      const method = init?.method ?? 'GET'

      if (path === '/api/file-checks' && method === 'GET') {
        return Promise.resolve(jsonResponse(history, historyStatus))
      }

      if (path === '/api/file-checks' && method === 'POST') {
        if (postError) {
          return Promise.resolve(jsonResponse({ detail: postError }, 400))
        }
        return Promise.resolve(jsonResponse(postReport))
      }

      const detailMatch = path.match(/^\/api\/file-checks\/(\d+)$/)
      if (detailMatch && method === 'GET') {
        const detail = details[Number(detailMatch[1])]
        return Promise.resolve(detail ? jsonResponse(detail) : jsonResponse({ detail: 'Not found' }, 404))
      }

      return Promise.resolve(new Response('Not found', { status: 404 }))
    })

    return fetchSpy
  }

  beforeEach(() => {
    mockFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the standalone file checker shell', async () => {
    render(<FileChecker />)

    expect(screen.getByRole('heading', { name: 'File checker' })).toBeInTheDocument()
    expect(screen.getByText('Drop CSV or TSV file here')).toBeInTheDocument()
    expect(screen.queryByText(/source detected/i)).not.toBeInTheDocument()
  })

  it('calls file check history and shows the empty state after an empty successful response', async () => {
    render(<FileChecker />)

    expect(global.fetch).toHaveBeenCalledWith('/api/file-checks', expect.any(Object))
    expect(screen.queryByText('No file checks yet')).not.toBeInTheDocument()
    expect(await screen.findByText('No file checks yet')).toBeInTheDocument()
  })

  it('shows an explicit history error instead of the empty state when file checks fail', async () => {
    vi.restoreAllMocks()
    mockFetch({ history: { items: [], total: 0 }, historyStatus: 500 })

    render(<FileChecker />)

    expect(await screen.findByText('Could not load file check history')).toBeInTheDocument()
    expect(screen.queryByText('No file checks yet')).not.toBeInTheDocument()
  })

  it('uploads a file, fetches its detail, and displays the uploaded report issues', async () => {
    const user = userEvent.setup()
    render(<FileChecker />)

    const input = screen.getByLabelText('Upload CSV or TSV file')
    const file = new File(['supplier_name\n'], 'vendors.csv', { type: 'text/csv' })

    await user.upload(input, file)

    expect(await screen.findByText('vendors.csv')).toBeInTheDocument()
    expect(await screen.findByText('Rows with issues')).toBeInTheDocument()
    expect(await screen.findByText('Required value is missing')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/file-checks', expect.objectContaining({ method: 'POST' }))
    expect(global.fetch).toHaveBeenCalledWith('/api/file-checks/42', expect.any(Object))
  })

  it('loads report detail when a history item is selected', async () => {
    mockFetch({ history: { items: [baseReport], total: 1 } })

    const user = userEvent.setup()
    render(<FileChecker />)

    await user.click(await screen.findByRole('button', { name: /vendors\.csv/i }))

    expect(await screen.findByText('Required value is missing')).toBeInTheDocument()
    expect(screen.getByText('supplier_name')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/file-checks/42', expect.any(Object))
  })

  it('shows an upload error when the backend rejects the file', async () => {
    mockFetch({ postError: 'Unsupported delimiter' })

    const user = userEvent.setup()
    render(<FileChecker />)

    await user.upload(
      screen.getByLabelText('Upload CSV or TSV file'),
      new File(['bad'], 'vendors.csv', { type: 'text/csv' }),
    )

    expect(await screen.findByText('Unsupported delimiter')).toBeInTheDocument()
  })
})
