// ── Upload — multi-step file ingestion with explicit source selection ──

import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  BatchResponse,
  DataSource,
  DataSourceCreate,
  UploadResponse,
  UploadStatsResponse,
} from '../api/types';
import DropZone from '../components/DropZone';
import ProgressTracker from '../components/ProgressTracker';
import ColumnMapper from '../components/ColumnMapper';
import ReUploadDialog from '../components/ReUploadDialog';
import BatchHistory from '../components/BatchHistory';
import Panel, { PanelHead } from '../components/ui/Panel';
import Spinner from '../components/ui/Spinner';
import { useRecordTypes } from '../hooks/useRecordTypes';
import { parseFileHeaders } from '../utils/fileHeaders';
import { defaultType } from '../utils/recordDisplay';

type UploadState =
  | { step: 'PICK_SOURCE' }
  | { step: 'DROP_FILE'; sourceId: number }
  | { step: 'DETECTING'; sourceId: number; file: File }
  | { step: 'MAP_COLUMNS'; file: File; columns: string[]; suggestedName: string; detectedDelimiter: string; type: string }
  | { step: 'PROCESSING'; taskId: string };

const STEPS = [
  { label: 'Select source' },
  { label: 'Upload file' },
  { label: 'Ingest' },
];

function stepIndex(state: UploadState): number {
  switch (state.step) {
    case 'PICK_SOURCE': return 0;
    case 'DROP_FILE': return 1;
    case 'DETECTING': return 1;
    case 'MAP_COLUMNS': return 1;
    case 'PROCESSING': return 2;
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

export default function Upload() {
  const queryClient = useQueryClient();
  const [uploadState, setUploadState] = useState<UploadState>({ step: 'PICK_SOURCE' });
  const [showReUpload, setShowReUpload] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [reUploadStats, setReUploadStats] = useState<UploadStatsResponse>({ staged_count: 0, pending_match_count: 0 });
  const [error, setError] = useState<string | null>(null);

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get<DataSource[]>('/api/sources'),
  });

  const { data: recordTypes } = useRecordTypes();

  const uploadWithFileMutation = useMutation({
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
    onError: (err: Error) => setError(err.message),
  });

  const createSourceMutation = useMutation({
    mutationFn: async (sourceData: DataSourceCreate) => api.post<DataSource>('/api/sources', sourceData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sources'] }),
  });

  const checkAndUpload = useCallback(async (sourceId: number, file: File) => {
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
        setPendingFile(file);
        setUploadState({ step: 'DROP_FILE', sourceId });
        setShowReUpload(true);
        return;
      }
    } catch {
      // proceed with upload if check fails
    }
    await uploadWithFileMutation.mutateAsync({ file, dataSourceId: sourceId });
  }, [uploadWithFileMutation]);

  const handleFileDropped = useCallback(async (sourceId: number, file: File) => {
    setError(null);
    setUploadState({ step: 'DETECTING', sourceId, file });
    try {
      await checkAndUpload(sourceId, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadState({ step: 'DROP_FILE', sourceId });
    }
  }, [checkAndUpload]);

  const handleCreateFromFile = useCallback(async (file: File) => {
    setError(null);
    const type = defaultType(recordTypes?.types);
    if (!type) {
      setError('No record types are available for source creation');
      return;
    }
    try {
      const parsed = await parseFileHeaders(file);
      const suggestedName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      setUploadState({
        step: 'MAP_COLUMNS',
        file,
        columns: parsed.columns,
        suggestedName,
        detectedDelimiter: parsed.delimiter ?? ';',
        type,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detect file headers');
    }
  }, [recordTypes]);

  const handleReUploadConfirm = () => {
    setShowReUpload(false);
    if (pendingSourceId && pendingFile) {
      uploadWithFileMutation.mutate({ file: pendingFile, dataSourceId: pendingSourceId });
    }
  };

  const handleReUploadCancel = () => {
    setShowReUpload(false);
    const sid = pendingSourceId;
    setPendingSourceId(null);
    setPendingFile(null);
    setUploadState(sid ? { step: 'DROP_FILE', sourceId: sid } : { step: 'PICK_SOURCE' });
  };

  const handleColumnMapSubmit = async (sourceData: DataSourceCreate) => {
    if (uploadState.step !== 'MAP_COLUMNS') return;
    setError(null);
    try {
      const newSource = await createSourceMutation.mutateAsync(sourceData);
      uploadWithFileMutation.mutate({ file: uploadState.file, dataSourceId: newSource.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source');
    }
  };

  const handleReset = () => {
    setUploadState({ step: 'PICK_SOURCE' });
    setPendingSourceId(null);
    setPendingFile(null);
    setError(null);
  };

  const reUploadSourceName = pendingSourceId
    ? sources?.find(s => s.id === pendingSourceId)?.name ?? 'Source'
    : 'Source';

  const isUploading = uploadWithFileMutation.isPending;

  return (
    <div className="scroll" style={{ height: '100%' }}>
      <div style={{ padding: 20, maxWidth: 1160, margin: '0 auto' }}>
        <div className="fade" style={{ marginBottom: 14 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>New batch</h1>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
            Select a source, upload a CSV/TSV, and we'll normalize, embed, and block for matching.
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

        {/* PICK_SOURCE */}
        {uploadState.step === 'PICK_SOURCE' && (
          <div className="fade" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Panel>
              <PanelHead
                title="Create new source from this file"
                actions={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-0)', border: '1px solid var(--border-0)', borderRadius: 4, padding: '3px 7px' }}>
                    <span style={{ fontSize: 10, color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>or existing:</span>
                    <select
                      className="input"
                      style={{ fontSize: 10, padding: '1px 4px', height: 'auto', background: 'transparent', border: 'none', color: 'var(--accent)', minWidth: 90, cursor: 'pointer' }}
                      value=""
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val) setUploadState({ step: 'DROP_FILE', sourceId: val });
                      }}
                    >
                      <option value="">select…</option>
                      {sources?.map(source => (
                        <option key={source.id} value={source.id}>
                          {source.name} ({source.type})
                        </option>
                      ))}
                    </select>
                  </div>
                }
              />
              <div style={{ padding: 14 }}>
                <DropZone onFileSelected={handleCreateFromFile} />
              </div>
            </Panel>
          </div>
        )}

        {/* DROP_FILE */}
        {uploadState.step === 'DROP_FILE' && (
          <Panel className="fade">
            <PanelHead>
              <span className="panel-title">
                Upload to{' '}
                <span style={{ color: 'var(--accent)' }}>
                  {sources?.find(s => s.id === uploadState.sourceId)?.name ?? `Source #${uploadState.sourceId}`}
                </span>
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setUploadState({ step: 'PICK_SOURCE' })}
              >
                Change source
              </button>
            </PanelHead>
            <div style={{ padding: 14 }}>
              <DropZone onFileSelected={(file) => handleFileDropped(uploadState.sourceId, file)} disabled={isUploading} />
            </div>
          </Panel>
        )}

        {/* DETECTING */}
        {uploadState.step === 'DETECTING' && (
          <Panel className="fade">
            <div style={{ padding: 36, textAlign: 'center' }}>
              <Spinner size={20} />
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 500 }}>Checking upload history…</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
                {uploadState.file.name}
              </div>
            </div>
          </Panel>
        )}

        {/* MAP_COLUMNS */}
        {uploadState.step === 'MAP_COLUMNS' && (
          <div className="fade">
            {recordTypes && recordTypes.types.length > 0 && (
              <Panel style={{ marginBottom: 12 }}>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="label">
                    Type <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    className="input"
                    value={uploadState.type}
                    onChange={(event) => setUploadState({
                      ...uploadState,
                      type: event.target.value,
                    })}
                    required
                  >
                    {recordTypes.types.map(rt => (
                      <option key={rt.key} value={rt.key}>{rt.label}</option>
                    ))}
                  </select>
                </div>
              </Panel>
            )}
            <ColumnMapper
              columns={uploadState.columns}
              type={uploadState.type}
              onSubmit={handleColumnMapSubmit}
              isSubmitting={createSourceMutation.isPending || uploadWithFileMutation.isPending}
              initialSourceName={uploadState.suggestedName}
              detectedDelimiter={uploadState.detectedDelimiter}
              recordTypeKey={uploadState.type}
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
              onComplete={() => {
                queryClient.invalidateQueries({ queryKey: ['batches'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
              }}
            />
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-1)', border: '1px solid var(--border-0)', borderRadius: 4 }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--fg-1)' }}>
                Ingest complete · <Link to="/compare" style={{ color: 'var(--accent)' }}>Compare this file →</Link>
              </span>
            </div>
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <button onClick={handleReset} className="btn btn-sm">
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>cloud_upload</span>
                Upload another file
              </button>
            </div>
          </div>
        )}

        {/* Recent batches — shown when idle */}
        {(uploadState.step === 'PICK_SOURCE' || uploadState.step === 'PROCESSING') && (
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
