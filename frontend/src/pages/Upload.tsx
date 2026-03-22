// ── Upload page — upload-first flow with auto source detection ──
// Light Glassmorphism aesthetic — file drop is the hero, auto-detect source

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  DataSource,
  DataSourceCreate,
  UploadResponse,
  BatchResponse,
  SourceMatch,
  SourceMatchResponse,
  GuessMappingResponse,
} from '../api/types';
import DropZone from '../components/DropZone';
import ProgressTracker from '../components/ProgressTracker';
import ColumnMapper from '../components/ColumnMapper';
import ReUploadDialog from '../components/ReUploadDialog';
import BatchHistory from '../components/BatchHistory';

// ── Upload states ──
type UploadState =
  | { step: 'DROP_FILE' }
  | { step: 'DETECTING'; file: File }
  | { step: 'MATCHED'; file: File; fileRef: string; match: SourceMatch; allMatches: SourceMatch[] }
  | { step: 'PICK_SOURCE'; file: File; fileRef: string; matches: SourceMatch[]; columns: string[]; detectedDelimiter?: string }
  | { step: 'MAP_COLUMNS'; file: File; fileRef: string; columns: string[]; suggestedName: string; guessedMapping?: GuessMappingResponse; detectedDelimiter?: string }
  | { step: 'PROCESSING'; taskId: string };

export default function Upload() {
  const queryClient = useQueryClient();

  // Core state
  const [uploadState, setUploadState] = useState<UploadState>({ step: 'DROP_FILE' });
  const [showReUpload, setShowReUpload] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState<number | null>(null);
  const [pendingFileRef, setPendingFileRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sources query (for re-upload detection — need batch counts)
  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get<DataSource[]>('/api/sources'),
  });

  // Match-source mutation
  const matchSourceMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<SourceMatchResponse>('/api/sources/match-source', formData);
    },
  });

  // Upload file mutation (supports file_ref)
  const uploadMutation = useMutation({
    mutationFn: async ({ fileRef, dataSourceId }: { fileRef: string; dataSourceId: number }) => {
      const formData = new FormData();
      formData.append('file_ref', fileRef);
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

  // Upload with new file (for MAP_COLUMNS flow — file hasn't been saved yet via match-source)
  const uploadWithFileMutation = useMutation({
    mutationFn: async ({ file, fileRef, dataSourceId }: { file: File; fileRef?: string; dataSourceId: number }) => {
      const formData = new FormData();
      if (fileRef) {
        formData.append('file_ref', fileRef);
      } else {
        formData.append('file', file);
      }
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

  const handleFileSelected = useCallback(async (file: File) => {
    if (matchSourceMutation.isPending) return;
    setError(null);
    setUploadState({ step: 'DETECTING', file });

    try {
      const result = await matchSourceMutation.mutateAsync(file);

      // Edge case: no sources exist at all → go directly to MAP_COLUMNS
      if (result.matches.length === 0) {
        // Check if there are zero sources total
        const allSources = sources ?? [];
        if (allSources.length === 0) {
          // Auto-guess column mapping
          let guessedMapping: GuessMappingResponse | undefined;
          try {
            const guessFd = new FormData();
            guessFd.append('file_ref', result.file_ref);
            guessedMapping = await api.upload<GuessMappingResponse>('/api/sources/guess-mapping', guessFd);
          } catch {
            // Non-critical — proceed without guesses
          }
          setUploadState({
            step: 'MAP_COLUMNS',
            file,
            fileRef: result.file_ref,
            columns: result.detected_columns,
            suggestedName: result.suggested_name,
            guessedMapping,
            detectedDelimiter: result.detected_delimiter,
          });
          return;
        }
        // Sources exist but none match → PICK_SOURCE with empty matches
        setUploadState({
          step: 'PICK_SOURCE',
          file,
          fileRef: result.file_ref,
          matches: result.matches,
          columns: result.detected_columns,
          detectedDelimiter: result.detected_delimiter,
        });
        return;
      }

      // Single high-confidence match → MATCHED
      if (result.suggested_source_id) {
        const topMatch = result.matches.find(m => m.source_id === result.suggested_source_id)!;
        setUploadState({
          step: 'MATCHED',
          file,
          fileRef: result.file_ref,
          match: topMatch,
          allMatches: result.matches,
        });
      } else {
        // Ambiguous → PICK_SOURCE
        setUploadState({
          step: 'PICK_SOURCE',
          file,
          fileRef: result.file_ref,
          matches: result.matches,
          columns: result.detected_columns,
          detectedDelimiter: result.detected_delimiter,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze file');
      setUploadState({ step: 'DROP_FILE' });
    }
  }, [matchSourceMutation, sources]);

  const handleConfirmSource = useCallback(async (sourceId: number, fileRef: string) => {
    // Check for re-upload (does this source have existing batches?)
    try {
      const batches = await api.get<BatchResponse[]>(`/api/import/batches?data_source_id=${sourceId}`);
      if (batches && batches.length > 0) {
        setPendingSourceId(sourceId);
        setPendingFileRef(fileRef);
        setShowReUpload(true);
        return;
      }
    } catch {
      // If we can't check, proceed anyway
    }
    uploadMutation.mutate({ fileRef, dataSourceId: sourceId });
  }, [uploadMutation]);

  const handleReUploadConfirm = () => {
    setShowReUpload(false);
    if (pendingSourceId && pendingFileRef) {
      uploadMutation.mutate({ fileRef: pendingFileRef, dataSourceId: pendingSourceId });
    }
  };

  const handleReUploadCancel = () => {
    setShowReUpload(false);
    setPendingSourceId(null);
    setPendingFileRef(null);
  };

  const handleColumnMapSubmit = async (sourceData: DataSourceCreate) => {
    if (uploadState.step !== 'MAP_COLUMNS') return;
    setError(null);

    try {
      const newSource = await createSourceMutation.mutateAsync(sourceData);
      uploadWithFileMutation.mutate({
        file: uploadState.file,
        fileRef: uploadState.fileRef,
        dataSourceId: newSource.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source');
    }
  };

  const handleReset = () => {
    setUploadState({ step: 'DROP_FILE' });
    setPendingSourceId(null);
    setPendingFileRef(null);
    setError(null);
  };

  // Re-upload impact counts
  const reUploadSourceName = pendingSourceId
    ? sources?.find(s => s.id === pendingSourceId)?.name ?? 'Source'
    : 'Source';

  const isUploading = uploadMutation.isPending || uploadWithFileMutation.isPending;

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8 animate-fadeIn">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-accent-600/10 border border-accent-600/20">
            <svg className="w-5 h-5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-display font-extrabold text-on-surface tracking-tight">
              Upload
            </h1>
            <p className="text-sm text-on-surface-variant/60 font-body">
              Drop a CSV file to get started — we'll detect the source automatically
            </p>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-danger-500/20 bg-danger-500/[0.08] px-5 py-4 animate-slideUp">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-danger-500/10 border border-danger-500/20 shrink-0">
            <svg className="w-4 h-4 text-danger-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-danger-500">Upload Error</p>
            <p className="text-xs text-danger-500/80 mt-1 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Main content — state-driven */}
      <div className="space-y-6">

        {/* ── DROP_FILE — Hero drop zone ── */}
        {uploadState.step === 'DROP_FILE' && (
          <div className="animate-fadeIn">
            <DropZone
              onFileSelected={handleFileSelected}
              disabled={matchSourceMutation.isPending}
            />
          </div>
        )}

        {/* ── DETECTING — Spinner while analyzing ── */}
        {uploadState.step === 'DETECTING' && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-accent-600/10 bg-accent-600/[0.04] p-16 animate-fadeIn">
            <div className="relative">
              <div className="w-12 h-12 border-2 border-accent-600/20 rounded-full" />
              <div className="absolute inset-0 w-12 h-12 border-2 border-transparent border-t-accent-600 rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-base font-display font-bold text-accent-600">Analyzing your file...</p>
              <p className="text-sm text-on-surface-variant/60 mt-1">{uploadState.file.name}</p>
              <p className="text-xs text-on-surface-variant/40 mt-2">Detecting columns and matching against known sources</p>
            </div>
          </div>
        )}

        {/* ── MATCHED — Single high-confidence match ── */}
        {uploadState.step === 'MATCHED' && (
          <div className="animate-slideUp">
            <div className="card p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-success-bg border border-success-500/20 shrink-0">
                  <svg className="w-6 h-6 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-success-500 font-semibold uppercase tracking-wider mb-1">Source Detected</p>
                  <p className="text-lg font-display font-extrabold text-on-surface">
                    This looks like <span className="text-accent-600">{uploadState.match.source_name}</span>
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {uploadState.match.column_match && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-success-500/15 bg-success-bg px-2 py-0.5 text-xs text-success-500">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        Column match
                      </span>
                    )}
                    {uploadState.match.filename_match && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-success-500/15 bg-success-bg px-2 py-0.5 text-xs text-success-500">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        Filename match
                      </span>
                    )}
                    {uploadState.match.data_overlap_pct > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-accent-600/15 bg-accent-600/[0.06] px-2 py-0.5 text-xs text-accent-600">
                        {Math.round(uploadState.match.data_overlap_pct * 100)}% data overlap
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleConfirmSource(uploadState.match.source_id, uploadState.fileRef)}
                  disabled={isUploading}
                  className="btn-primary flex-1"
                >
                  {isUploading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  Confirm & Upload
                </button>
                <button
                  onClick={() => {
                    setUploadState({
                      step: 'PICK_SOURCE',
                      file: uploadState.file,
                      fileRef: uploadState.fileRef,
                      matches: uploadState.allMatches,
                      columns: [],  // columns not needed for picking existing source
                    });
                  }}
                  className="rounded-xl border border-white/60 bg-white/30 px-5 py-3 text-sm font-medium text-on-surface-variant transition-all hover:bg-white/50 hover:text-on-surface"
                >
                  Choose different source
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PICK_SOURCE — List of compatible sources ── */}
        {uploadState.step === 'PICK_SOURCE' && (
          <div className="animate-slideUp">
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-on-surface/5">
                <h3 className="text-sm font-display font-bold text-on-surface">Select a data source</h3>
                <p className="text-xs text-on-surface-variant/60 mt-1">
                  {uploadState.matches.length > 0
                    ? `${uploadState.matches.length} compatible source${uploadState.matches.length !== 1 ? 's' : ''} found for your file`
                    : 'No matching sources found — create a new one below'}
                </p>
              </div>

              {uploadState.matches.length > 0 && (
                <div className="divide-y divide-on-surface/[0.06]">
                  {uploadState.matches.map((match) => (
                    <button
                      key={match.source_id}
                      onClick={() => handleConfirmSource(match.source_id, uploadState.fileRef)}
                      disabled={isUploading}
                      className="w-full text-left px-6 py-4 hover:bg-white/30 transition-all group disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            match.confidence === 'high' ? 'bg-success-500' :
                            match.confidence === 'medium' ? 'bg-warning-500' :
                            'bg-on-surface-variant/40'
                          }`} />
                          <span className="text-sm font-medium text-on-surface truncate">{match.source_name}</span>
                          <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            match.confidence === 'high' ? 'bg-success-bg text-success-500' :
                            match.confidence === 'medium' ? 'bg-warning-500/10 text-warning-500' :
                            'bg-white/30 text-on-surface-variant/60'
                          }`}>
                            {match.confidence}
                          </span>
                        </div>
                        <svg className="w-4 h-4 text-on-surface-variant/40 group-hover:text-accent-600 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 ml-5.5">
                        {match.column_match && (
                          <span className="text-[10px] text-success-500/70">Columns match</span>
                        )}
                        {match.filename_match && (
                          <span className="text-[10px] text-success-500/70">Filename match</span>
                        )}
                        {match.data_overlap_pct > 0 && (
                          <span className="text-[10px] text-accent-600/70">{Math.round(match.data_overlap_pct * 100)}% data overlap</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Create new source option */}
              <div className="border-t border-on-surface/[0.06]">
                <button
                  onClick={() => {
                    // We need columns for MAP_COLUMNS; they're in the PICK_SOURCE state
                    const state = uploadState as Extract<UploadState, { step: 'PICK_SOURCE' }>;
                    // If we came from MATCHED → PICK_SOURCE, we may not have columns
                    // In that case, re-detect is needed. But match-source already gave us the columns in the response.
                    // For PICK_SOURCE state, columns are already present.
                    const suggestedName = state.file.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                    // Helper to fetch guessed mapping and transition to MAP_COLUMNS
                    const goToMapColumns = async (cols: string[]) => {
                      let guessedMapping: GuessMappingResponse | undefined;
                      try {
                        const guessFd = new FormData();
                        guessFd.append('file_ref', state.fileRef);
                        guessedMapping = await api.upload<GuessMappingResponse>('/api/sources/guess-mapping', guessFd);
                      } catch {
                        // Non-critical
                      }
                      setUploadState({
                        step: 'MAP_COLUMNS',
                        file: state.file,
                        fileRef: state.fileRef,
                        columns: cols,
                        suggestedName,
                        guessedMapping,
                        detectedDelimiter: state.detectedDelimiter,
                      });
                    };

                    if (state.columns.length > 0) {
                      goToMapColumns(state.columns);
                    } else {
                      const fd = new FormData();
                      fd.append('file', state.file);
                      api.upload<{ columns: string[] }>('/api/sources/detect-columns', fd).then(result => {
                        goToMapColumns(result.columns);
                      }).catch(() => {
                        setError('Failed to detect columns');
                      });
                    }
                  }}
                  className="w-full text-left px-6 py-4 hover:bg-accent-600/[0.04] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-accent-600/10 border border-accent-600/20 shrink-0">
                      <svg className="w-3.5 h-3.5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-accent-600">Create new source</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Back to drop zone */}
            <div className="flex justify-center mt-4">
              <button
                onClick={handleReset}
                className="text-xs text-on-surface-variant/60 hover:text-on-surface transition-colors"
              >
                Upload a different file
              </button>
            </div>
          </div>
        )}

        {/* ── MAP_COLUMNS — New source creation ── */}
        {uploadState.step === 'MAP_COLUMNS' && (
          <div className="animate-slideUp">
            <ColumnMapper
              columns={uploadState.columns}
              onSubmit={handleColumnMapSubmit}
              isSubmitting={createSourceMutation.isPending || uploadWithFileMutation.isPending}
              initialSourceName={uploadState.suggestedName}
              guessedMapping={uploadState.guessedMapping}
              detectedDelimiter={uploadState.detectedDelimiter}
            />
            <div className="flex justify-center mt-4">
              <button
                onClick={handleReset}
                className="text-xs text-on-surface-variant/60 hover:text-on-surface transition-colors"
              >
                Start over
              </button>
            </div>
          </div>
        )}

        {/* ── PROCESSING — Progress tracker ── */}
        {uploadState.step === 'PROCESSING' && (
          <div className="animate-slideUp">
            <ProgressTracker taskId={uploadState.taskId} onComplete={() => queryClient.invalidateQueries({ queryKey: ['batches'] })} />

            <div className="flex justify-center mt-6">
              <button
                onClick={handleReset}
                className="group flex items-center gap-2.5 rounded-xl border border-white/60 bg-white/30 px-6 py-3 text-sm font-medium text-on-surface transition-all hover:bg-white/50 hover:border-accent-600/20 hover:text-on-surface"
              >
                <svg className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Upload another file
              </button>
            </div>
          </div>
        )}

        {/* Batch history — always visible on drop or processing */}
        {(uploadState.step === 'DROP_FILE' || uploadState.step === 'PROCESSING') && (
          <div className="mt-2 animate-fadeIn stagger-2">
            <BatchHistory />
          </div>
        )}
      </div>

      {/* Re-upload dialog */}
      {showReUpload && (
        <ReUploadDialog
          sourceName={reUploadSourceName}
          existingCount={0}
          pendingMatchCount={0}
          onConfirm={handleReUploadConfirm}
          onCancel={handleReUploadCancel}
        />
      )}
    </div>
  );
}
