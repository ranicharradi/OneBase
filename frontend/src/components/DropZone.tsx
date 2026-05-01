// ── Drag-and-drop file upload zone — terminal aesthetic ──

import { useCallback, useRef, useState } from 'react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DropZone({ onFileSelected, disabled = false }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const processFile = useCallback((file: File) => {
    if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
      setSelectedFile(file);
      onFileSelected(file);
    }
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [disabled, processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const handleBrowseClick = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleBrowseClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Drop a CSV file or click to browse"
      style={{
        border: `2px dashed ${isDragOver ? 'var(--accent)' : selectedFile ? 'var(--ok)' : 'var(--border-1)'}`,
        background: isDragOver
          ? 'var(--accent-soft)'
          : selectedFile
            ? 'var(--ok-soft)'
            : 'var(--bg-1)',
        padding: '60px 40px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 'var(--radius)',
        transition:
          'border-color 0.18s ease, background 0.25s ease, transform 0.18s ease, box-shadow 0.25s ease',
        transform: isDragOver ? 'scale(1.005)' : 'scale(1)',
        boxShadow: isDragOver ? '0 8px 32px -8px var(--accent-border)' : 'none',
        opacity: disabled ? 0.6 : 1,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle accent sweep on drag-over */}
      {isDragOver && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'repeating-linear-gradient(45deg, transparent 0 12px, var(--accent-soft) 12px 24px)',
            backgroundSize: '32px 32px',
            animation: 'drop-marching 0.8s linear infinite',
            opacity: 0.7,
          }}
        />
      )}

      <div
        style={{
          width: 44,
          height: 44,
          margin: '0 auto 12px',
          borderRadius: 8,
          background: isDragOver
            ? 'var(--accent-soft)'
            : selectedFile
              ? 'var(--ok-soft)'
              : 'var(--bg-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isDragOver ? 'var(--accent)' : selectedFile ? 'var(--ok)' : 'var(--fg-1)',
          transition: 'background 0.25s ease, color 0.25s ease, transform 0.2s ease',
          transform: isDragOver ? 'scale(1.12)' : 'scale(1)',
          // Idle = breathing; selected = one-shot pop; dragging = no animation, transform takes over
          animation: selectedFile
            ? 'drop-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both'
            : isDragOver
              ? 'none'
              : 'drop-breathe 3.2s ease-in-out infinite',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
          {selectedFile ? 'check_circle' : 'cloud_upload'}
        </span>
      </div>

      <div className="fade" style={{ position: 'relative', zIndex: 1 }}>
        {selectedFile ? (
          <>
            <div className="mono" style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              {selectedFile.name}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
              {formatSize(selectedFile.size)}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: 15,
                fontWeight: 500,
                marginBottom: 4,
                color: isDragOver ? 'var(--accent)' : 'var(--fg-0)',
                transition: 'color 0.18s ease',
              }}
            >
              {isDragOver ? 'Release to upload' : 'Drop CSV or TSV file here'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>
              up to 100 MB · UTF-8 preferred
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleBrowseClick(); }}
              disabled={disabled}
              className="btn btn-sm"
              style={{
                marginTop: 14,
                opacity: isDragOver ? 0 : 1,
                pointerEvents: isDragOver ? 'none' : 'auto',
                transition: 'opacity 0.18s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>folder_open</span>
              Browse files
            </button>
            <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 12 }}>
              .csv · .tsv · delimiters auto-detected
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,.tsv"
        onChange={handleFileInput}
        style={{ display: 'none' }}
        disabled={disabled}
      />
    </div>
  );
}
