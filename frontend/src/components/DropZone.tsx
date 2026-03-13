// ── Drag-and-drop file upload zone — refined industrial dark theme ──

import { useState, useRef, useCallback } from 'react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
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
        relative group cursor-pointer rounded-2xl border-2 border-dashed p-12
        transition-all duration-300 ease-out overflow-hidden
        ${disabled
          ? 'border-white/[0.04] bg-surface-900/20 opacity-50 cursor-not-allowed'
          : isDragOver
            ? 'border-accent-400/60 bg-accent-500/[0.06] scale-[1.01] shadow-[0_0_40px_-12px_rgba(59,130,246,0.15)]'
            : selectedFile
              ? 'border-success-500/30 bg-success-500/[0.03]'
              : 'border-white/[0.08] bg-surface-900/30 hover:border-white/[0.14] hover:bg-surface-900/50'
        }
      `}
    >
      {/* Subtle grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Glow effect on drag-over */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl animate-pulse">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-accent-500/[0.08] via-transparent to-accent-500/[0.04]" />
        </div>
      )}

      <div className="relative flex flex-col items-center text-center">
        {selectedFile ? (
          <>
            {/* File selected state */}
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-success-500/10 border border-success-500/20 mb-4">
              <svg className="w-7 h-7 text-success-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-white mb-1">{selectedFile.name}</p>
            <p className="text-xs text-surface-500">{formatSize(selectedFile.size)}</p>
          </>
        ) : (
          <>
            {/* Upload icon */}
            <div className={`
              flex items-center justify-center w-16 h-16 rounded-2xl mb-5
              transition-all duration-300
              ${isDragOver
                ? 'bg-accent-500/15 border border-accent-500/30 scale-110'
                : 'bg-surface-800/60 border border-white/[0.06] group-hover:bg-surface-800 group-hover:border-white/[0.1]'
              }
            `}>
              <svg
                className={`w-8 h-8 transition-all duration-300 ${
                  isDragOver ? 'text-accent-400 -translate-y-1' : 'text-surface-500 group-hover:text-surface-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>

            <p className={`text-base font-medium mb-2 transition-colors duration-200 ${
              isDragOver ? 'text-accent-300' : 'text-gray-300'
            }`}>
              {isDragOver ? 'Drop your file here' : 'Drag & drop your CSV file here'}
            </p>
            <p className="text-sm text-surface-500 mb-5">or</p>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleBrowseClick();
              }}
              disabled={disabled}
              className="rounded-xl bg-surface-800 border border-white/[0.08] px-5 py-2.5 text-sm font-medium text-gray-200 transition-all duration-200 hover:bg-surface-700 hover:border-white/[0.14] hover:text-white active:scale-[0.98]"
            >
              Browse files
            </button>

            <p className="mt-4 text-xs text-surface-600">
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
