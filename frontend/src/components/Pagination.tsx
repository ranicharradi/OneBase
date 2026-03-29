// ── Reusable pagination — Previous/Next with page indicator ──

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

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

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-on-surface/10 bg-white/40 hover:bg-white/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-sm">chevron_left</span>
          Previous
        </button>

        <span className="px-2 text-xs font-mono text-on-surface" aria-current="page">
          {page + 1} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          aria-label="Next page"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-on-surface/10 bg-white/40 hover:bg-white/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
      </div>
    </nav>
  );
}
