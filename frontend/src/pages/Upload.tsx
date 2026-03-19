// ── Upload page — complete upload experience with state machine ──
// Dark Precision Editorial aesthetic — atmospheric upload zone, smooth state transitions

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  DataSource,
  DataSourceCreate,
  UploadResponse,
  BatchResponse,
  ColumnDetectResponse,
} from '../api/types';
import DropZone from '../components/DropZone';
import ProgressTracker from '../components/ProgressTracker';
import ColumnMapper from '../components/ColumnMapper';
import ReUploadDialog from '../components/ReUploadDialog';
import BatchHistory from '../components/BatchHistory';

// ── Upload states ──
type UploadState =
  | { step: 'SELECT_SOURCE' }
  | { step: 'UPLOAD_FILE'; file?: File }
  | { step: 'MAP_COLUMNS'; file: File; columns: string[] }
  | { step: 'PROCESSING'; taskId: string };

const NEW_SOURCE_VALUE = '__new__';

export default function Upload() {
  const queryClient = useQueryClient();

  // Core state
  const [uploadState, setUploadState] = useState<UploadState>({ step: 'SELECT_SOURCE' });
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showReUpload, setShowReUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sources query
  const { data: sources, isLoading: sourcesLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get<DataSource[]>('/api/sources'),
  });

  // Batches for selected source (to determine re-upload)
  const selectedSource = sources?.find((s) => s.id === Number(selectedSourceId));
  const { data: existingBatches } = useQuery({
    queryKey: ['batches', selectedSourceId],
    queryFn: () => api.get<BatchResponse[]>(`/api/import/batches?data_source_id=${selectedSourceId}`),
    enabled: !!selectedSourceId && selectedSourceId !== NEW_SOURCE_VALUE,
  });

  // Detect columns mutation
  const detectColumnsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<ColumnDetectResponse>('/api/sources/detect-columns', formData);
    },
  });

  // Upload file mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, dataSourceId }: { file: File; dataSourceId: number }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('data_source_id', String(dataSourceId));
      return api.upload<UploadResponse>('/api/import/upload', formData);
    },
    onSuccess: (data) => {
      setUploadState({ step: 'PROCESSING', taskId: data.task_id });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  // Create source mutation (for new source flow)
  const createSourceMutation = useMutation({
    mutationFn: async (sourceData: DataSourceCreate) => {
      return api.post<DataSource>('/api/sources', sourceData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  // ── Handlers ──

  const handleSourceChange = (value: string) => {
    setSelectedSourceId(value);
    setError(null);
    if (value && value !== NEW_SOURCE_VALUE) {
      setUploadState({ step: 'UPLOAD_FILE' });
    } else if (value === NEW_SOURCE_VALUE) {
      setUploadState({ step: 'UPLOAD_FILE' });
    } else {
      setUploadState({ step: 'SELECT_SOURCE' });
    }
  };

  const handleFileSelected = useCallback(async (file: File) => {
    // Guard against double-submission
    if (uploadMutation.isPending || detectColumnsMutation.isPending) return;
    setError(null);

    if (selectedSourceId === NEW_SOURCE_VALUE) {
      // New source flow: detect columns, show mapper
      try {
        const result = await detectColumnsMutation.mutateAsync(file);
        setUploadState({ step: 'MAP_COLUMNS', file, columns: result.columns });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to detect columns');
      }
    } else {
      // Existing source flow: check for re-upload
      const hasExistingBatches = existingBatches && existingBatches.length > 0;
      if (hasExistingBatches) {
        setPendingFile(file);
        setShowReUpload(true);
      } else {
        // First upload for this source — go directly
        uploadMutation.mutate({ file, dataSourceId: Number(selectedSourceId) });
      }
    }
  }, [selectedSourceId, existingBatches, detectColumnsMutation, uploadMutation]);

  const handleReUploadConfirm = () => {
    setShowReUpload(false);
    if (pendingFile && selectedSourceId) {
      uploadMutation.mutate({ file: pendingFile, dataSourceId: Number(selectedSourceId) });
    }
  };

  const handleReUploadCancel = () => {
    setShowReUpload(false);
    setPendingFile(null);
  };

  const handleColumnMapSubmit = async (sourceData: DataSourceCreate) => {
    if (uploadState.step !== 'MAP_COLUMNS') return;
    setError(null);

    try {
      const newSource = await createSourceMutation.mutateAsync(sourceData);
      // Now upload the file to the newly created source
      uploadMutation.mutate({ file: uploadState.file, dataSourceId: newSource.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source');
    }
  };

  const handleReset = () => {
    setUploadState({ step: 'SELECT_SOURCE' });
    setSelectedSourceId('');
    setPendingFile(null);
    setError(null);
  };

  // Re-upload impact counts
  const existingRowCount = existingBatches
    ?.filter((b) => b.status !== 'superseded')
    ?.reduce((sum, b) => sum + (b.row_count ?? 0), 0) ?? 0;

  const isProcessing = uploadState.step === 'PROCESSING';

  return (
    <div>
      {/* Page header — display font with atmospheric icon, matches Sources/Users pattern */}
      <div className="flex items-center justify-between mb-8 animate-fadeIn">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-accent-500/10 border border-accent-500/20 glow-accent">
            <svg className="w-5 h-5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-display text-white tracking-tight text-glow-accent">
              Upload
            </h1>
            <p className="text-sm text-surface-500 font-body">
              Import supplier CSV files for processing and matching
            </p>
          </div>
        </div>
      </div>

      {/* Source selector — styled card with accent border and icon */}
      <div className="mb-8 animate-fadeIn stagger-1">
        <label className="mb-2.5 block text-xs font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-accent-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75" />
          </svg>
          Data Source
        </label>

        <div className="flex items-center gap-3 max-w-lg">
          {/* Custom select with glass styling */}
          <div className="relative flex-1">
            <select
              value={selectedSourceId}
              onChange={(e) => handleSourceChange(e.target.value)}
              disabled={isProcessing}
              className="w-full rounded-xl border border-white/[0.08] bg-surface-900/60 px-4 py-3 text-sm text-white outline-none transition-all appearance-none cursor-pointer hover:border-accent-500/20 focus:border-accent-500/40 focus:ring-2 focus:ring-accent-500/10 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2306b6d4' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19.5 8.25l-7.5 7.5-7.5-7.5'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.75rem center',
                backgroundSize: '1.25rem',
                paddingRight: '2.5rem',
              }}
            >
              <option value="">Select a data source...</option>
              <option value={NEW_SOURCE_VALUE}>＋ Create new source</option>
              {sourcesLoading && <option disabled>Loading sources...</option>}
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {/* Glow line under select when source is chosen */}
            {selectedSourceId && (
              <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-accent-500/40 to-transparent" />
            )}
          </div>

          {/* Quick status indicator */}
          {selectedSourceId && selectedSourceId !== NEW_SOURCE_VALUE && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-500/[0.06] border border-accent-500/10 text-xs text-accent-400 animate-fadeIn whitespace-nowrap">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-400" />
              Source selected
            </div>
          )}
          {selectedSourceId === NEW_SOURCE_VALUE && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary-500/[0.06] border border-secondary-500/10 text-xs text-secondary-400 animate-fadeIn whitespace-nowrap">
              <div className="w-1.5 h-1.5 rounded-full bg-secondary-400" />
              New source
            </div>
          )}
        </div>
      </div>

      {/* Error display — matches danger pattern from Sources/Users */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-danger-500/20 bg-danger-500/[0.06] px-5 py-4 animate-slideUp">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-danger-500/10 border border-danger-500/20 shrink-0">
            <svg className="w-4 h-4 text-danger-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-danger-300">Upload Error</p>
            <p className="text-xs text-danger-400/80 mt-1 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Main content area — state-driven with transition wrapper */}
      <div className="space-y-6">
        {/* Awaiting source selection — atmospheric hero zone */}
        {uploadState.step === 'SELECT_SOURCE' && !selectedSourceId && (
          <div className="relative flex flex-col items-center justify-center rounded-2xl border border-white/[0.04] bg-surface-900/20 p-20 overflow-hidden animate-fadeIn">
            {/* Background atmospheric effects */}
            <div className="absolute inset-0 pointer-events-none">
              <div
                className="absolute inset-0 opacity-[0.015]"
                style={{
                  backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
                  backgroundSize: '24px 24px',
                }}
              />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent-500/[0.03] rounded-full blur-3xl" />
            </div>

            <div className="relative">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-800/40 border border-white/[0.06] mb-6 mx-auto animate-float">
                <svg className="w-8 h-8 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <p className="text-lg font-display text-gray-200 mb-1.5 text-center">Select a data source to begin</p>
              <p className="text-sm text-surface-500 text-center">Choose an existing source or create a new one from the dropdown above</p>
            </div>
          </div>
        )}

        {/* Drop zone for file upload */}
        {uploadState.step === 'UPLOAD_FILE' && (
          <div className="animate-slideUp">
            <DropZone
              onFileSelected={handleFileSelected}
              disabled={uploadMutation.isPending || detectColumnsMutation.isPending}
            />
          </div>
        )}

        {/* Loading state when detecting columns */}
        {detectColumnsMutation.isPending && (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-accent-500/10 bg-accent-500/[0.03] p-12 animate-fadeIn">
            <div className="relative">
              <div className="w-8 h-8 border-2 border-accent-400/20 rounded-full" />
              <div className="absolute inset-0 w-8 h-8 border-2 border-transparent border-t-accent-400 rounded-full animate-spin" />
            </div>
            <div>
              <p className="text-sm font-medium text-accent-300">Detecting columns...</p>
              <p className="text-xs text-surface-500 mt-0.5">Analyzing CSV structure</p>
            </div>
          </div>
        )}

        {/* Column mapper for new sources */}
        {uploadState.step === 'MAP_COLUMNS' && (
          <div className="animate-slideUp">
            <ColumnMapper
              columns={uploadState.columns}
              onSubmit={handleColumnMapSubmit}
              isSubmitting={createSourceMutation.isPending || uploadMutation.isPending}
            />
          </div>
        )}

        {/* Progress tracker */}
        {uploadState.step === 'PROCESSING' && (
          <div className="animate-slideUp">
            <ProgressTracker taskId={uploadState.taskId} />

            {/* Reset button after processing */}
            <div className="flex justify-center mt-6">
              <button
                onClick={handleReset}
                className="group flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-surface-800/50 px-6 py-3 text-sm font-medium text-gray-300 transition-all hover:bg-surface-700 hover:border-accent-500/20 hover:text-white"
              >
                <svg className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Upload another file
              </button>
            </div>
          </div>
        )}

        {/* Batch history — visible when source is selected */}
        {selectedSourceId && selectedSourceId !== NEW_SOURCE_VALUE && (
          <div className="mt-2 animate-fadeIn stagger-2">
            <BatchHistory dataSourceId={Number(selectedSourceId)} />
          </div>
        )}
      </div>

      {/* Re-upload dialog */}
      {showReUpload && selectedSource && (
        <ReUploadDialog
          sourceName={selectedSource.name}
          existingCount={existingRowCount}
          pendingMatchCount={0}
          onConfirm={handleReUploadConfirm}
          onCancel={handleReUploadCancel}
        />
      )}
    </div>
  );
}
