// ── Pagination — terminal aesthetic ──

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);

  const pages: (number | 'ellipsis')[] = [];
  const near = new Set([0, 1, current - 1, current, current + 1, total - 2, total - 1]);

  let prev = -1;
  for (const p of [...near].sort((a, b) => a - b)) {
    if (p < 0 || p >= total) continue;
    if (prev !== -1 && p - prev > 1) pages.push('ellipsis');
    pages.push(p);
    prev = p;
  }
  return pages;
}

export default function Pagination({ page, pageSize, totalItems, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  if (totalItems === 0) return null;

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 4px',
        fontSize: 11,
        color: 'var(--fg-2)',
      }}
    >
      <span className="mono">
        Showing <span style={{ color: 'var(--fg-0)', fontWeight: 600 }}>{start}–{end}</span> of{' '}
        <span style={{ color: 'var(--fg-0)', fontWeight: 600 }}>{totalItems.toLocaleString()}</span>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
          className="btn btn-sm"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>chevron_left</span>
          Prev
        </button>

        {getPageNumbers(page, totalPages).map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="mono" style={{ padding: '0 6px', color: 'var(--fg-3)' }}>
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p + 1}`}
              aria-current={p === page ? 'page' : undefined}
              className={p === page ? 'btn btn-sm btn-accent' : 'btn btn-sm'}
              style={{ minWidth: 28, padding: '0 8px' }}
            >
              {p + 1}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          aria-label="Next page"
          className="btn btn-sm"
        >
          Next
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>chevron_right</span>
        </button>
      </div>
    </nav>
  );
}
