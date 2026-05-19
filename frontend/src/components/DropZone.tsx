// ── Drag-and-drop file upload zone ──

import { useCallback, useRef, useState } from 'react';
import { CheckCircle2Icon, CloudUploadIcon, FolderOpenIcon } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { formatFileSize } from '../utils/filesize';
import { ALLOWED_UPLOAD_ACCEPT, isAllowedUpload } from '../utils/fileFormat';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function DropZone({ onFileSelected, disabled = false }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
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
    if (isAllowedUpload(file.name)) {
      setSelectedFile(file);
      setError('');
      onFileSelected(file);
    } else {
      setSelectedFile(null);
      setError('Only CSV and Excel files are accepted.');
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
      aria-label="Drop a CSV or Excel file or click to browse"
      className={[
        'relative overflow-hidden rounded-[var(--radius)] border-2 border-dashed px-10 py-[60px] text-center transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isDragOver
          ? 'scale-[1.005] border-primary bg-primary/5 shadow-lg'
          : selectedFile
            ? 'border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/30'
            : 'border-primary/40 bg-card hover:border-primary hover:bg-primary/5',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      {/* Subtle accent sweep on drag-over */}
      {isDragOver && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-[drop-marching_0.8s_linear_infinite] opacity-70"
          style={{
            background:
              'repeating-linear-gradient(45deg, transparent 0 12px, rgb(from var(--primary) r g b / 0.08) 12px 24px)',
            backgroundSize: '32px 32px',
          }}
        />
      )}

      <div
        className={[
          'relative z-[1] mx-auto mb-3 flex size-11 items-center justify-center rounded-lg transition-all duration-200',
          isDragOver
            ? 'scale-[1.12] bg-primary/10 text-primary'
            : selectedFile
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
              : 'bg-muted text-foreground/60',
        ].join(' ')}
        style={{
          animation: selectedFile
            ? 'drop-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both'
            : isDragOver
              ? 'none'
              : 'drop-breathe 3.2s ease-in-out infinite',
        }}
      >
        {selectedFile ? (
          <CheckCircle2Icon className="size-[22px]" />
        ) : (
          <CloudUploadIcon className="size-[22px]" />
        )}
      </div>

      <div className="relative z-[1]">
        {selectedFile ? (
          <>
            <div className="mb-1 font-mono text-[13px] font-medium">
              {selectedFile.name}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {formatFileSize(selectedFile.size)}
            </div>
          </>
        ) : (
          <>
            <div
              className={[
                'mb-1 text-[15px] font-medium transition-colors duration-200',
                isDragOver ? 'text-primary' : 'text-foreground',
              ].join(' ')}
            >
              {isDragOver ? 'Release to upload' : 'Drop CSV or Excel file here'}
            </div>
            <div className="text-[12px] text-muted-foreground">
              up to 50 MB · UTF-8 preferred
            </div>
            {error && (
              <Badge
                variant="destructive"
                role="alert"
                className="mx-auto mt-3 w-fit max-w-full justify-center px-2.5 py-1"
              >
                {error}
              </Badge>
            )}
            <Button
              type="button"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleBrowseClick(); }}
              disabled={disabled}
              className={[
                'mt-3.5 transition-opacity duration-200',
                isDragOver ? 'pointer-events-none opacity-0' : 'opacity-100',
              ].join(' ')}
            >
              <FolderOpenIcon className="size-3.5" />
              Browse files
            </Button>
            <div className="mt-3 font-mono text-[10px] text-muted-foreground/70">
              .csv · .xlsx · delimiters auto-detected
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_UPLOAD_ACCEPT}
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
}
