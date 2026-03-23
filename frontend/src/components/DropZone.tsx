// ── Drag-and-drop file upload zone ──
// Light Glassmorphism — airy drag zone with soft hover interaction

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

      {/* Base surface */}
      <div className={`absolute inset-0 rounded-2xl transition-all duration-500 ${
        isDragOver
          ? 'bg-accent-600/[0.06]'
          : selectedFile
            ? 'bg-success-500/[0.04]'
            : 'bg-white/20'
      }`} />

      {/* Border */}
      <div className={`absolute inset-0 rounded-2xl transition-all duration-500 ${
        isDragOver
          ? 'border-2 border-accent-600/40'
          : selectedFile
            ? 'border border-success-500/20'
            : 'border border-dashed border-on-surface/10 group-hover:border-on-surface/20'
      }`} />

      {/* Dot-grid background texture */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
          isDragOver ? 'opacity-[0.06]' : 'opacity-[0.03]'
        }`}
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Central glow orb */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-all duration-700 ${
        isDragOver
          ? 'w-[500px] h-[500px] bg-accent-600/[0.06] blur-[100px]'
          : showAccepted
            ? 'w-[400px] h-[400px] bg-success-500/[0.06] blur-[80px]'
            : 'w-[300px] h-[300px] bg-accent-600/[0.04] blur-[60px] group-hover:bg-accent-600/[0.06]'
      }`} />

      {/* Top edge highlight on drag-over */}
      {isDragOver && (
        <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-accent-600/60 to-transparent" />
      )}

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col items-center text-center">
        {selectedFile ? (
          <>
            {/* File accepted state */}
            <div className={`flex items-center justify-center w-16 h-16 rounded-2xl mb-5 transition-all duration-500 ${
              showAccepted
                ? 'bg-success-bg border border-success-500/30 scale-110'
                : 'bg-success-bg border border-success-500/20'
            }`}>
              <svg className="w-7 h-7 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-on-surface mb-1 font-body">{selectedFile.name}</p>
            <p className="text-xs text-on-surface-variant/60 font-mono">{formatSize(selectedFile.size)}</p>
          </>
        ) : (
          <>
            {/* Upload icon */}
            <div className={`
              relative flex items-center justify-center w-20 h-20 rounded-2xl mb-6
              transition-all duration-500
              ${isDragOver
                ? 'bg-accent-600/15 border-2 border-accent-600/40 scale-110'
                : 'bg-white/30 border border-on-surface/5 group-hover:bg-white/50 group-hover:border-on-surface/10'
              }
            `}>
              <svg
                className={`relative w-9 h-9 transition-all duration-500 ${
                  isDragOver
                    ? 'text-accent-600 -translate-y-1.5'
                    : 'text-outline group-hover:text-accent-600/60 animate-float'
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

            {/* Text */}
            <p className={`text-lg font-display font-bold mb-2 transition-all duration-300 ${
              isDragOver ? 'text-accent-600 scale-105' : 'text-on-surface'
            }`}>
              {isDragOver ? 'Release to upload' : 'Drag & drop your CSV'}
            </p>
            <p className={`text-sm mb-6 transition-all duration-300 ${
              isDragOver ? 'text-accent-600/60' : 'text-on-surface-variant/60'
            }`}>
              {isDragOver ? 'File will be processed immediately' : 'or browse to select'}
            </p>

            {/* Browse button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleBrowseClick();
              }}
              disabled={disabled}
              className={`rounded-xl border px-6 py-2.5 text-sm font-medium transition-all duration-300 active:scale-[0.97] ${
                isDragOver
                  ? 'border-accent-600/30 bg-accent-600/10 text-accent-600 opacity-0 pointer-events-none'
                  : 'border-white/60 bg-white/40 text-on-surface hover:bg-white/60 hover:border-accent-600/20 hover:text-on-surface'
              }`}
            >
              Browse files
            </button>

            {/* File hint */}
            <p className={`mt-5 text-xs transition-all duration-300 ${
              isDragOver ? 'text-accent-600/40' : 'text-outline'
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
