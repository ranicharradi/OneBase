// ── Upload — terminal aesthetic, multi-step file ingestion ──

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  BatchResponse,
  DataSource,
  DataSourceCreate,
  GuessMappingResponse,
  SourceMatch,
  SourceMatchResponse,
  UploadResponse,
  UploadStatsResponse,
} from '../api/types';
import DropZone from '../components/DropZone';
import ProgressTracker from '../components/ProgressTracker';
import ColumnMapper from '../components/ColumnMapper';
import ReUploadDialog from '../components/ReUploadDialog';
import BatchHistory from '../components/BatchHistory';
import Panel, { PanelHead } from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Spinner from '../components/ui/Spinner';

type UploadState =
  | { step: 'DROP_FILE' }
  | { step: 'DETECTING'; file: File }
  | { step: 'MATCHED'; file: File; fileRef: string; match: SourceMatch; allMatches: SourceMatch[] }
  | { step: 'PICK_SOURCE'; file: File; fileRef: string; matches: SourceMatch[]; columns: string[]; detectedDelimiter?: string }
  | { step: 'MAP_COLUMNS'; file: File; fileRef: string; columns: string[]; suggestedName: string; guessedMapping?: GuessMappingResponse; detectedDelimiter?: string }
  | { step: 'PROCESSING'; taskId: string };

const STEPS: Array<{ key: UploadState['step'] | 'STEPPER_STAGE'; label: string }> = [
  { key: 'STEPPER_STAGE', label: 'Drop file' },
  { key: 'STEPPER_STAGE', label: 'Match source' },
  { key: 'STEPPER_STAGE', label: 'Confirm' },
  { key: 'STEPPER_STAGE', label: 'Ingest' },
];

function stepIndex(state: UploadState): number {
  switch (state.step) {
    case 'DROP_FILE': return 0;
    case 'DETECTING': return 0;
    case 'PICK_SOURCE':
    case 'MATCHED':
    case 'MAP_COLUMNS':
      return 1;
    case 'PROCESSING':
      return 3;
  }
}

function Stepper({ state }: { state: UploadState }) {
  const idx = stepIndex(state);
  return (
    <div className="panel" style={{ padding: '10px 14px', display: 'flex', gap: 18, marginBottom: 14 }}>
      {STEPS.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEPS.length - 1 ? '1 1 0' : '0 0 auto' }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                background: done ? 'var(--ok)' : active ? 'var(--accent)' : 'var(--bg-2)',
                color: done || active ? '#fff' : 'var(--fg-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'IBM Plex Mono, monospace',
                flexShrink: 0,
              }}
            >
              {done ? <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span> : i + 1}
            </div>
            <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--fg-0)' : done ? 'var(--fg-1)' : 'var(--fg-2)' }}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? 'var(--ok)' : 'var(--border-0)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConfidenceTag({ confidence }: { confidence: SourceMatch['confidence'] }) {
  if (confidence === 'high') return <Pill tone="ok">high</Pill>;
  if (confidence === 'medium') return <Pill tone="warn">medium</Pill>;
  return <Pill tone="neutral">low</Pill>;
}

export default function Upload() {
  const queryClient = useQueryClient();
  const [uploadState, setUploadState] = useState<UploadState>({ step: 'DROP_FILE' });
  const [showReUpload, setShowReUpload] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState<number | null>(null);
  const [pendingFileRef, setPendingFileRef] = useState<string | null>(null);
  const [reUploadStats, setReUploadStats] = useState<UploadStatsResponse>({ staged_count: 0, pending_match_count: 0 });
  const [error, setError] = useState<string | null>(null);

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get<DataSource[]>('/api/sources'),
  });

  const matchSourceMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<SourceMatchResponse>('/api/sources/match-source', formData);
    },
  });

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
    onError: (err: Error) => setError(err.message),
  });

  const uploadWithFileMutation = useMutation({
    mutationFn: async ({ file, fileRef, dataSourceId }: { file: File; fileRef?: string; dataSourceId: number }) => {
      const formData = new FormData();
      if (fileRef) formData.append('file_ref', fileRef);
      else formData.append('file', file);
      formData.append('data_source_id', String(dataSourceId));
      return api.upload<UploadResponse>('/api/import/upload', formData);
    },
    onSuccess: (data) => {
      setUploadState({ step: 'PROCESSING', taskId: data.task_id });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const createSourceMutation = useMutation({
    mutationFn: async (sourceData: DataSourceCreate) => api.post<DataSource>('/api/sources', sourceData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });

  const handleFileSelected = useCallback(async (file: File) => {
    if (matchSourceMutation.isPending) return;
    setError(null);
    setUploadState({ step: 'DETECTING', file });

    try {
      const result = await matchSourceMutation.mutateAsync(file);
      if (result.matches.length === 0) {
        const allSources = sources ?? [];
        if (allSources.length === 0) {
          let guessedMapping: GuessMappingResponse | undefined;
          try {
            const guessFd = new FormData();
            guessFd.append('file_ref', result.file_ref);
            guessedMapping = await api.upload<GuessMappingResponse>('/api/sources/guess-mapping', guessFd);
          } catch {
            // non-critical
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

      if (result.suggested_source_id) {
        const topMatch = result.matches.find(m => m.source_id === result.suggested_source_id)!;
        setUploadState({ step: 'MATCHED', file, fileRef: result.file_ref, match: topMatch, allMatches: result.matches });
      } else {
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
    try {
      const batches = await api.get<BatchResponse[]>(`/api/import/batches?data_source_id=${sourceId}`);
      if (batches && batches.length > 0) {
        try {
          const stats = await api.get<UploadStatsResponse>(`/api/sources/${sourceId}/upload-stats`);
          setReUploadStats(stats);
        } catch {
          setReUploadStats({ staged_count: 0, pending_match_count: 0 });
        }
        setPendingSourceId(sourceId);
        setPendingFileRef(fileRef);
        setShowReUpload(true);
        return;
      }
    } catch {
      // proceed
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

  const reUploadSourceName = pendingSourceId
    ? sources?.find(s => s.id === pendingSourceId)?.name ?? 'Source'
    : 'Source';

  const isUploading = uploadMutation.isPending || uploadWithFileMutation.isPending;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20, maxWidth: 1160, margin: '0 auto' }}>
        <div className="fade" style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>New batch</h1>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
            Upload a CSV/TSV. We auto-detect the source, normalize fields, embed, and block for matching.
          </div>
        </div>

        <Stepper state={uploadState} />

        {error && (
          <div
            className="pill danger"
            style={{ width: '100%', padding: '8px 12px', justifyContent: 'flex-start', marginBottom: 12 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
            <span><b>Upload error:</b> {error}</span>
          </div>
        )}

        {/* DROP_FILE */}
        {uploadState.step === 'DROP_FILE' && (
          <div className="fade">
            <DropZone onFileSelected={handleFileSelected} disabled={matchSourceMutation.isPending} />
          </div>
        )}

        {/* DETECTING */}
        {uploadState.step === 'DETECTING' && (
          <Panel className="fade">
            <div style={{ padding: 36, textAlign: 'center' }}>
              <Spinner size={20} />
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 500 }}>Analyzing file…</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
                {uploadState.file.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 6 }}>
                Detecting columns and matching against known sources
              </div>
            </div>
          </Panel>
        )}

        {/* MATCHED */}
        {uploadState.step === 'MATCHED' && (
          <Panel className="fade">
            <PanelHead>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="panel-title">Source detected</span>
                <Pill tone="ok" dot>match</Pill>
              </div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                {uploadState.file.name}
              </span>
            </PanelHead>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                This looks like <span style={{ color: 'var(--accent)' }}>{uploadState.match.source_name}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {uploadState.match.column_match && (
                  <Pill tone="ok" icon="check">column match</Pill>
                )}
                {uploadState.match.filename_match && (
                  <Pill tone="ok" icon="check">filename match</Pill>
                )}
                {uploadState.match.data_overlap_pct > 0 && (
                  <Pill tone="accent">
                    {Math.round(uploadState.match.data_overlap_pct * 100)}% data overlap
                  </Pill>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleConfirmSource(uploadState.match.source_id, uploadState.fileRef)}
                  disabled={isUploading}
                  className="btn btn-accent"
                >
                  {isUploading ? <Spinner size={10} color="#fff" /> : <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>}
                  Confirm & upload
                </button>
                <button
                  onClick={() => setUploadState({
                    step: 'PICK_SOURCE',
                    file: uploadState.file,
                    fileRef: uploadState.fileRef,
                    matches: uploadState.allMatches,
                    columns: [],
                  })}
                  className="btn"
                >
                  Choose different source
                </button>
                <span style={{ flex: 1 }} />
                <button onClick={handleReset} className="btn btn-ghost btn-sm">
                  Cancel
                </button>
              </div>
            </div>
          </Panel>
        )}

        {/* PICK_SOURCE */}
        {uploadState.step === 'PICK_SOURCE' && (
          <Panel className="fade">
            <PanelHead title="Select a data source" />
            {uploadState.matches.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
                No compatible sources found. Create a new one below.
              </div>
            ) : (
              uploadState.matches.map(match => (
                <button
                  key={match.source_id}
                  onClick={() => handleConfirmSource(match.source_id, uploadState.fileRef)}
                  disabled={isUploading}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: 'none',
                    borderBottom: '1px solid var(--border-0)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: 'var(--fg-0)',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <ConfidenceTag confidence={match.confidence} />
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{match.source_name}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {match.column_match && (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ok)' }}>columns</span>
                    )}
                    {match.filename_match && (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ok)' }}>filename</span>
                    )}
                    {match.data_overlap_pct > 0 && (
                      <span className="mono" style={{ fontSize: 10, color: 'var(--accent)' }}>
                        {Math.round(match.data_overlap_pct * 100)}% overlap
                      </span>
                    )}
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--fg-3)' }}>
                    arrow_forward
                  </span>
                </button>
              ))
            )}

            <button
              onClick={() => {
                const state = uploadState as Extract<UploadState, { step: 'PICK_SOURCE' }>;
                const suggestedName = state.file.name
                  .replace(/\.csv$/i, '')
                  .replace(/[_-]/g, ' ')
                  .replace(/\b\w/g, c => c.toUpperCase());

                const goToMapColumns = async (cols: string[]) => {
                  let guessedMapping: GuessMappingResponse | undefined;
                  try {
                    const guessFd = new FormData();
                    guessFd.append('file_ref', state.fileRef);
                    guessedMapping = await api.upload<GuessMappingResponse>('/api/sources/guess-mapping', guessFd);
                  } catch {
                    // non-critical
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
                  api
                    .upload<{ columns: string[] }>('/api/sources/detect-columns', fd)
                    .then(result => goToMapColumns(result.columns))
                    .catch(() => setError('Failed to detect columns'));
                }
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                border: 'none',
                borderTop: '1px solid var(--border-0)',
                background: 'var(--accent-soft)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--accent)',
                textAlign: 'left',
                fontWeight: 500,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
              Create new source from this file
            </button>

            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-0)', textAlign: 'center' }}>
              <button onClick={handleReset} className="btn btn-ghost btn-sm">
                Upload a different file
              </button>
            </div>
          </Panel>
        )}

        {/* MAP_COLUMNS */}
        {uploadState.step === 'MAP_COLUMNS' && (
          <div className="fade">
            <ColumnMapper
              columns={uploadState.columns}
              onSubmit={handleColumnMapSubmit}
              isSubmitting={createSourceMutation.isPending || uploadWithFileMutation.isPending}
              initialSourceName={uploadState.suggestedName}
              guessedMapping={uploadState.guessedMapping}
              detectedDelimiter={uploadState.detectedDelimiter}
            />
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button onClick={handleReset} className="btn btn-ghost btn-sm">
                Start over
              </button>
            </div>
          </div>
        )}

        {/* PROCESSING */}
        {uploadState.step === 'PROCESSING' && (
          <div className="fade">
            <ProgressTracker
              taskId={uploadState.taskId}
              onComplete={() => queryClient.invalidateQueries({ queryKey: ['batches'] })}
            />
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button onClick={handleReset} className="btn btn-sm">
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>cloud_upload</span>
                Upload another file
              </button>
            </div>
          </div>
        )}

        {/* Recent batches — shown when idle */}
        {(uploadState.step === 'DROP_FILE' || uploadState.step === 'PROCESSING') && (
          <div className="fade" style={{ marginTop: 14 }}>
            <BatchHistory />
          </div>
        )}
      </div>

      {showReUpload && (
        <ReUploadDialog
          sourceName={reUploadSourceName}
          existingCount={reUploadStats.staged_count}
          pendingMatchCount={reUploadStats.pending_match_count}
          onConfirm={handleReUploadConfirm}
          onCancel={handleReUploadCancel}
        />
      )}
    </div>
  );
}
