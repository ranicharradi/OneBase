// ── Pagination ──

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      className="flex items-center justify-between px-1 py-1.5 text-[11px] text-muted-foreground"
    >
      <span className="font-mono">
        Showing <span className="text-foreground font-semibold">{start}–{end}</span> of{' '}
        <span className="text-foreground font-semibold">{totalItems.toLocaleString()}</span>
      </span>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          aria-label="Previous page"
        >
          <ChevronLeftIcon className="size-3" />
          Prev
        </Button>

        {getPageNumbers(page, totalPages).map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="font-mono px-1.5 text-muted-foreground/70">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p + 1}`}
              aria-current={p === page ? 'page' : undefined}
              className="min-w-[28px] px-2"
            >
              {p + 1}
            </Button>
          ),
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          aria-label="Next page"
        >
          Next
          <ChevronRightIcon className="size-3" />
        </Button>
      </div>
    </nav>
  );
}
