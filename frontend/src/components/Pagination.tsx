// ── Reusable pagination — Previous / page numbers / Next ──

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

/**
 * Build a list of page numbers to render, collapsing ranges into ellipses.
 * Always shows first, last, and up to 2 pages around the current page.
 */
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

const btnBase =
  'inline-flex items-center justify-center text-xs font-medium rounded-md border transition-colors';
const navBtn = `${btnBase} gap-1 px-3 py-1.5 border-on-surface/10 bg-white/40 hover:bg-white/60 disabled:opacity-40 disabled:cursor-not-allowed`;
const pageBtn = `${btnBase} min-w-[28px] py-1.5 border-on-surface/10`;

export default function Pagination({ page, pageSize, totalItems, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  if (totalItems === 0) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between px-1 py-3 text-xs text-on-surface-variant/60"
    >
      <span className="font-mono">
        Showing <span className="text-on-surface font-semibold">{start}&ndash;{end}</span> of{' '}
        <span className="text-on-surface font-semibold">{totalItems.toLocaleString()}</span>
      </span>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
          className={navBtn}
        >
          <span className="material-symbols-outlined text-sm">chevron_left</span>
          Prev
        </button>

        {getPageNumbers(page, totalPages).map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-1 text-on-surface-variant/40 select-none">
              &hellip;
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p + 1}`}
              aria-current={p === page ? 'page' : undefined}
              className={`${pageBtn} ${
                p === page
                  ? 'bg-accent-600 text-white border-accent-600 font-bold'
                  : 'bg-white/40 hover:bg-white/60 text-on-surface'
              }`}
            >
              {p + 1}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          aria-label="Next page"
          className={navBtn}
        >
          Next
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>
    </nav>
  );
}
