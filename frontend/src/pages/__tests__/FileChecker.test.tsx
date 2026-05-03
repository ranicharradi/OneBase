import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '../../test/test-utils'
import FileChecker from '../FileChecker'

describe('FileChecker page', () => {
  const mockFetch = (response: Response) => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((url) => {
      if (String(url).includes('/api/file-checks')) {
        return Promise.resolve(response)
      }
      return Promise.resolve(new Response('Not found', { status: 404 }))
    })

    return fetchSpy
  }

  beforeEach(() => {
    mockFetch(
      new Response(JSON.stringify({ items: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
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
    mockFetch(
      new Response(JSON.stringify({ detail: 'History service unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(<FileChecker />)

    expect(await screen.findByText('Could not load file check history')).toBeInTheDocument()
    expect(screen.queryByText('No file checks yet')).not.toBeInTheDocument()
  })
})
