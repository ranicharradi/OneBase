// ── Drag-and-drop file upload zone ──
// Dark Precision Editorial — atmospheric drag zone with dramatic hover interaction

import { useState, useRef, useCallback } from 'react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function DropZone({ onFileSelected, disabled = false }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showAccepted, setShowAccepted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only trigger if leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const processFile = useCallback((file: File) => {
    if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
      setSelectedFile(file);
      // Brief acceptance flash
      setShowAccepted(true);
      setTimeout(() => setShowAccepted(false), 800);
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
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [processFile]);

  const handleBrowseClick = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleBrowseClick}
      className={`
        relative group cursor-pointer rounded-2xl p-14
        transition-all duration-500 ease-out overflow-hidden
        ${disabled
          ? 'opacity-50 cursor-not-allowed'
          : isDragOver
            ? 'scale-[1.005]'
            : ''
        }
      `}
    >
      {/* ── Background layers ── */}

      {/* Base surface with subtle gradient */}
      <div className={`absolute inset-0 rounded-2xl transition-all duration-500 ${
        isDragOver
          ? 'bg-gradient-to-b from-accent-500/[0.08] via-surface-900/80 to-accent-500/[0.04]'
          : selectedFile
            ? 'bg-gradient-to-b from-success-500/[0.04] via-surface-900/50 to-transparent'
            : 'bg-gradient-to-b from-surface-800/30 via-surface-900/40 to-surface-800/20'
      }`} />

      {/* Border — animated on drag, gradient normally */}
      <div className={`absolute inset-0 rounded-2xl transition-all duration-500 ${
        isDragOver
          ? 'border-2 border-accent-400/50 shadow-[inset_0_0_30px_rgba(6,182,212,0.06)]'
          : selectedFile
            ? 'border border-success-500/25'
            : 'border border-dashed border-white/[0.08] group-hover:border-white/[0.14]'
      }`}
        style={isDragOver ? {
          animation: 'pulse-glow 2s ease-in-out infinite',
        } : undefined}
      />

      {/* Dot-grid background texture */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
          isDragOver ? 'opacity-[0.04]' : 'opacity-[0.02]'
        }`}
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Diagonal scan lines — subtle texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.008]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 8px,
            currentColor 8px,
            currentColor 9px
          )`,
        }}
      />

      {/* Central glow orb — intensifies on drag-over */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-all duration-700 ${
        isDragOver
          ? 'w-[500px] h-[500px] bg-accent-500/[0.08] blur-[100px]'
          : showAccepted
            ? 'w-[400px] h-[400px] bg-success-500/[0.06] blur-[80px]'
            : 'w-[300px] h-[300px] bg-accent-500/[0.02] blur-[60px] group-hover:bg-accent-500/[0.04]'
      }`} />

      {/* Top edge glow on drag-over */}
      {isDragOver && (
        <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-accent-400/60 to-transparent" />
      )}

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col items-center text-center">
        {selectedFile ? (
          <>
            {/* File accepted state */}
            <div className={`flex items-center justify-center w-16 h-16 rounded-2xl mb-5 transition-all duration-500 ${
              showAccepted
                ? 'bg-success-500/15 border border-success-400/30 scale-110'
                : 'bg-success-500/10 border border-success-500/20'
            }`}>
              <svg className="w-7 h-7 text-success-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-white mb-1 font-body">{selectedFile.name}</p>
            <p className="text-xs text-surface-500 font-mono">{formatSize(selectedFile.size)}</p>
          </>
        ) : (
          <>
            {/* Upload icon — prominent with accent treatment */}
            <div className={`
              relative flex items-center justify-center w-20 h-20 rounded-2xl mb-6
              transition-all duration-500
              ${isDragOver
                ? 'bg-accent-500/15 border-2 border-accent-400/40 scale-110 shadow-[0_0_40px_rgba(6,182,212,0.15)]'
                : 'bg-surface-800/40 border border-white/[0.06] group-hover:bg-surface-800/60 group-hover:border-white/[0.12]'
              }
            `}>
              {/* Icon glow ring on drag-over */}
              {isDragOver && (
                <div className="absolute inset-0 rounded-2xl animate-pulse-glow" />
              )}
              <svg
                className={`relative w-9 h-9 transition-all duration-500 ${
                  isDragOver
                    ? 'text-accent-300 -translate-y-1.5'
                    : 'text-surface-500 group-hover:text-accent-500/60 animate-float'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>

            {/* Text — display font for hero emphasis */}
            <p className={`text-lg font-display mb-2 transition-all duration-300 ${
              isDragOver ? 'text-accent-300 text-glow-accent scale-105' : 'text-gray-200'
            }`}>
              {isDragOver ? 'Release to upload' : 'Drag & drop your CSV'}
            </p>
            <p className={`text-sm mb-6 transition-all duration-300 ${
              isDragOver ? 'text-accent-400/60' : 'text-surface-500'
            }`}>
              {isDragOver ? 'File will be processed immediately' : 'or browse to select'}
            </p>

            {/* Browse button — secondary action with accent hover */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleBrowseClick();
              }}
              disabled={disabled}
              className={`rounded-xl border px-6 py-2.5 text-sm font-medium transition-all duration-300 active:scale-[0.97] ${
                isDragOver
                  ? 'border-accent-500/30 bg-accent-500/10 text-accent-300 opacity-0 pointer-events-none'
                  : 'border-white/[0.08] bg-surface-800/60 text-gray-300 hover:bg-surface-700 hover:border-accent-500/20 hover:text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.06)]'
              }`}
            >
              Browse files
            </button>

            {/* File hint — subtle */}
            <p className={`mt-5 text-xs transition-all duration-300 ${
              isDragOver ? 'text-accent-500/40' : 'text-surface-600'
            }`}>
              Only .csv files accepted
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
}
