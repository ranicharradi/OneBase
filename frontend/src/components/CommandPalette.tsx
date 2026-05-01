import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { UnifiedSupplierListResponse } from '../api/types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  section: 'Navigate' | 'Actions' | 'Records';
  label: string;
  hint?: string;
  kbd?: string;
  icon: string;
  onSelect: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // focus after the dialog mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced supplier search — only fires when palette is open and query has 2+ chars
  const trimmed = query.trim();
  const supplierEnabled = open && trimmed.length >= 2;
  const { data: supplierResults } = useQuery<UnifiedSupplierListResponse>({
    queryKey: ['command-palette-suppliers', trimmed],
    queryFn: () => {
      const params = new URLSearchParams({ search: trimmed, limit: '8' });
      return api.get(`/api/unified/suppliers?${params}`);
    },
    enabled: supplierEnabled,
    staleTime: 30_000,
  });

  const items = useMemo<PaletteItem[]>(() => {
    const navItems: PaletteItem[] = [
      { section: 'Navigate', label: 'Go to Dashboard', kbd: 'G D', icon: 'home', onSelect: () => navigate('/dashboard') },
      { section: 'Navigate', label: 'Go to Upload', kbd: 'G U', icon: 'cloud_upload', onSelect: () => navigate('/upload') },
      { section: 'Navigate', label: 'Go to Sources', kbd: 'G S', icon: 'storage', onSelect: () => navigate('/sources') },
      { section: 'Navigate', label: 'Go to Review queue', kbd: 'G R', icon: 'swap_horiz', onSelect: () => navigate('/review') },
      { section: 'Navigate', label: 'Go to Unified records', kbd: 'G M', icon: 'verified', onSelect: () => navigate('/unified') },
      { section: 'Navigate', label: 'Go to Users & access', kbd: 'G A', icon: 'group', onSelect: () => navigate('/users') },
      { section: 'Actions', label: 'New data source', icon: 'add', onSelect: () => navigate('/sources') },
      { section: 'Actions', label: 'Upload CSV batch', icon: 'cloud_upload', onSelect: () => navigate('/upload') },
      { section: 'Actions', label: 'Retrain model', icon: 'auto_awesome', onSelect: () => navigate('/review') },
      { section: 'Actions', label: 'Browse unified records', icon: 'arrow_forward', onSelect: () => navigate('/unified') },
    ];

    const supplierItems: PaletteItem[] = (supplierResults?.items ?? []).map(s => ({
      section: 'Records' as const,
      label: s.name || `Record #${s.id}`,
      hint: s.source_code ?? undefined,
      icon: 'verified',
      onSelect: () => navigate(`/unified/${s.id}`),
    }));

    const lower = trimmed.toLowerCase();
    const filtered = lower
      ? navItems.filter(i => i.label.toLowerCase().includes(lower))
      : navItems;
    return [...filtered, ...supplierItems];
  }, [navigate, supplierResults, trimmed]);

  // Reset selection when items change
  useEffect(() => { setActiveIdx(0); }, [items.length]);

  // Group items by section in render order
  const grouped = useMemo(() => {
    const out: Record<string, { item: PaletteItem; idx: number }[]> = {};
    items.forEach((item, idx) => {
      (out[item.section] ||= []).push({ item, idx });
    });
    return out;
  }, [items]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIdx];
      if (item) {
        item.onSelect();
        onClose();
      }
    }
  };

  return (
    <div className="backdrop backdrop-top" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: 560,
          background: 'var(--bg-1)',
          border: '1px solid var(--border-1)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--border-0)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--fg-2)' }}>
            search
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, search records, paste an ID…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--fg-0)',
            }}
            aria-label="Command palette query"
          />
          <span className="kbd">ESC</span>
        </div>

        <div className="scroll" style={{ maxHeight: '50vh' }}>
          {items.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
              No matches
            </div>
          )}
          {Object.entries(grouped).map(([section, entries]) => (
            <div key={section}>
              <div className="label" style={{ padding: '10px 14px 4px' }}>{section}</div>
              {entries.map(({ item, idx }) => {
                const active = idx === activeIdx;
                return (
                  <button
                    key={`${section}-${idx}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => { item.onSelect(); onClose(); }}
                    style={{
                      width: '100%',
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: active ? 'var(--bg-2)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: 'var(--fg-0)',
                      fontSize: 13,
                      textAlign: 'left',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--fg-2)' }}>
                      {item.icon}
                    </span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.hint && (
                      <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>{item.hint}</span>
                    )}
                    {item.kbd && <span className="kbd">{item.kbd}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--border-0)',
            display: 'flex',
            gap: 14,
            color: 'var(--fg-2)',
            fontSize: 10,
          }}
        >
          <span><span className="kbd">↑↓</span> navigate</span>
          <span><span className="kbd">↵</span> select</span>
          <span><span className="kbd">⌘K</span> open</span>
        </div>
      </div>
    </div>
  );
}
