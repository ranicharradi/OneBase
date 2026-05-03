import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  FileCheckIssue,
  FileCheckReport,
  FileCheckReportDetail,
  FileCheckReportListResponse,
} from '../api/types';
import Kpi from '../components/ui/Kpi';
import Panel, { PanelHead } from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Spinner from '../components/ui/Spinner';

type IssueTypeFilter = FileCheckIssue['issue_type'] | 'all';
type SeverityFilter = FileCheckIssue['severity'] | 'all';

const ISSUE_TYPES: IssueTypeFilter[] = ['all', 'empty_row', 'missing_value', 'corrupted_value', 'parse_error'];
const SEVERITIES: SeverityFilter[] = ['all', 'info', 'warning', 'error'];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return 'Not completed';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusTone(status: FileCheckReport['status']): 'ok' | 'warn' | 'danger' | 'accent' {
  if (status === 'clean') return 'ok';
  if (status === 'warning') return 'warn';
  if (status === 'failed' || status === 'error') return 'danger';
  return 'accent';
}

function issueLabel(type: FileCheckIssue['issue_type']): string {
  return type.replace(/_/g, ' ');
}

export default function FileChecker() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [issueType, setIssueType] = useState<IssueTypeFilter>('all');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [isDragging, setIsDragging] = useState(false);

  const {
    data: reports,
    isError: historyIsError,
    isLoading: historyIsLoading,
  } = useQuery({
    queryKey: ['file-checks'],
    queryFn: () => api.get<FileCheckReportListResponse>('/api/file-checks'),
  });

  const detailQuery = useQuery({
    queryKey: ['file-checks', selectedReportId],
    queryFn: () => api.get<FileCheckReportDetail>(`/api/file-checks/${selectedReportId}?issue_limit=500&issue_offset=0`),
    enabled: selectedReportId !== null,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<FileCheckReport>('/api/file-checks', formData);
    },
    onSuccess: report => {
      setSelectedReportId(report.id);
      setIssueType('all');
      setSeverity('all');
      void queryClient.invalidateQueries({ queryKey: ['file-checks'] });
    },
  });

  const reportItems = reports?.items ?? [];
  const currentReport = detailQuery.data;
  const filtersDisabled = !currentReport || detailQuery.isLoading;
  const loadedIssueCount = currentReport?.issues.length ?? 0;
  const hasPartialIssues = currentReport ? currentReport.issue_total > loadedIssueCount : false;
  const hasActiveIssueFilters = issueType !== 'all' || severity !== 'all';
  const visibleIssues = useMemo(() => {
    const issues = currentReport?.issues ?? [];
    return issues.filter(issue => {
      const matchesType = issueType === 'all' || issue.issue_type === issueType;
      const matchesSeverity = severity === 'all' || issue.severity === severity;
      return matchesType && matchesSeverity;
    });
  }, [currentReport?.issues, issueType, severity]);

  const uploadFile = (file: File | undefined) => {
    if (!file || uploadMutation.isPending) return;
    uploadMutation.mutate(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    uploadFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="scroll" style={{ height: '100%', padding: 18 }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 650 }}>File checker</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--fg-2)', fontSize: 13 }}>
            Check CSV/TSV files for missing rows and quality issues outside the ingestion pipeline.
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <section
              aria-label="File upload"
              aria-busy={uploadMutation.isPending}
              onDragEnter={event => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={event => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              style={{
                minHeight: 180,
                border: `1px dashed ${isDragging ? 'var(--accent)' : 'var(--border-1)'}`,
                borderRadius: 6,
                background: 'var(--bg-0)',
                color: 'var(--fg-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
              }}
            >
              <input
                ref={inputRef}
                aria-label="Upload CSV or TSV file"
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                disabled={uploadMutation.isPending}
                style={{ display: 'none' }}
                onChange={event => uploadFile(event.target.files?.[0])}
              />
              <div style={{ textAlign: 'center', maxWidth: 260 }}>
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ fontSize: 28, color: 'var(--fg-2)', marginBottom: 10 }}
                >
                  rule
                </span>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-0)' }}>Drop CSV or TSV file here</div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  style={{ marginTop: 12 }}
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Spinner size={12} />
                      Checking
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 14 }}>
                        upload_file
                      </span>
                      Browse
                    </>
                  )}
                </button>
                {uploadMutation.isError && (
                  <div
                    role="alert"
                    className="pill danger"
                    style={{ marginTop: 12, width: '100%', padding: '6px 10px', justifyContent: 'center' }}
                  >
                    {errorMessage(uploadMutation.error)}
                  </div>
                )}
              </div>
            </section>

            <Panel>
              <PanelHead title="Report history" />
              <div style={{ padding: 10, minHeight: 160 }}>
                {historyIsLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-2)', fontSize: 12 }}>
                    <Spinner size={14} />
                    <span>Loading reports</span>
                  </div>
                ) : historyIsError ? (
                  <div>
                    <div style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>
                      Could not load file check history
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--fg-2)', fontSize: 12 }}>
                      Refresh the page or try again later.
                    </div>
                  </div>
                ) : reportItems.length === 0 ? (
                  <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>No file checks yet</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {reportItems.map(report => (
                      <button
                        key={report.id}
                        type="button"
                        className="btn"
                        aria-pressed={selectedReportId === report.id}
                        onClick={() => {
                          setSelectedReportId(report.id);
                          setIssueType('all');
                          setSeverity('all');
                        }}
                        style={{
                          justifyContent: 'space-between',
                          width: '100%',
                          minHeight: 40,
                          borderColor: selectedReportId === report.id ? 'var(--accent)' : 'var(--border-1)',
                        }}
                      >
                        <span style={{ minWidth: 0, textAlign: 'left' }}>
                          <span
                            style={{
                              display: 'block',
                              color: 'var(--fg-0)',
                              fontSize: 12,
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {report.original_filename}
                          </span>
                          <span className="mono" style={{ display: 'block', color: 'var(--fg-2)', fontSize: 10 }}>
                            {formatDate(report.completed_at ?? report.created_at)}
                          </span>
                        </span>
                        <Pill tone={statusTone(report.status)}>{report.status}</Pill>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <Panel>
              <PanelHead
                title={currentReport ? currentReport.original_filename : 'Current report'}
                actions={currentReport && <Pill tone={statusTone(currentReport.status)}>{currentReport.status}</Pill>}
              />
              <div style={{ padding: 14 }}>
                {detailQuery.isLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-2)', fontSize: 12 }}>
                    <Spinner size={14} />
                    <span>Loading report</span>
                  </div>
                ) : detailQuery.isError ? (
                  <div
                    role="alert"
                    className="pill danger"
                    style={{ padding: '6px 10px', justifyContent: 'flex-start' }}
                  >
                    {errorMessage(detailQuery.error)}
                  </div>
                ) : currentReport ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: 10,
                      }}
                    >
                      <Kpi label="Total rows" icon="table_rows" value={formatNumber(currentReport.total_rows)} />
                      <Kpi
                        label="Rows with issues"
                        icon="warning"
                        value={formatNumber(currentReport.rows_with_issues)}
                        tone={currentReport.rows_with_issues > 0 ? 'warn' : 'ok'}
                      />
                      <Kpi label="Empty rows" icon="remove_selection" value={formatNumber(currentReport.empty_row_count)} />
                      <Kpi
                        label="Missing values"
                        icon="data_alert"
                        value={formatNumber(currentReport.missing_value_count)}
                      />
                      <Kpi
                        label="Corrupted values"
                        icon="error"
                        value={formatNumber(currentReport.corrupted_value_count)}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                      <span className="mono" style={{ color: 'var(--fg-2)' }}>
                        {fileSize(currentReport.file_size_bytes)}
                      </span>
                      <span className="mono" style={{ color: 'var(--fg-2)' }}>
                        delimiter {currentReport.delimiter === '\t' ? 'tab' : currentReport.delimiter}
                      </span>
                      <span className="mono" style={{ color: 'var(--fg-2)' }}>
                        {formatNumber(currentReport.issue_total)} issues
                      </span>
                    </div>
                    {currentReport.issue_cap_reached && (
                      <div
                        aria-live="polite"
                        className="pill warn"
                        style={{ padding: '6px 10px', justifyContent: 'flex-start' }}
                      >
                        Issue cap reached. Showing stored issues only.
                      </div>
                    )}
                    {hasPartialIssues && (
                      <div
                        aria-live="polite"
                        className="pill warn"
                        style={{ padding: '6px 10px', justifyContent: 'flex-start' }}
                      >
                        Showing first {formatNumber(loadedIssueCount)} of {formatNumber(currentReport.issue_total)} issues.
                        Filters apply to loaded issues.
                      </div>
                    )}
                    {currentReport.status === 'error' && currentReport.error_message && (
                      <div
                        role="alert"
                        className="pill danger"
                        style={{ padding: '6px 10px', justifyContent: 'flex-start' }}
                      >
                        {currentReport.error_message}
                      </div>
                    )}
                  </div>
                ) : (
                  <span style={{ color: 'var(--fg-2)', fontSize: 12 }}>Select or upload a report.</span>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHead
                title="Issues"
                actions={
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      aria-label="Filter issue type"
                      value={issueType}
                      disabled={filtersDisabled}
                      onChange={event => setIssueType(event.target.value as IssueTypeFilter)}
                      style={{ height: 28, fontSize: 12 }}
                    >
                      {ISSUE_TYPES.map(type => (
                        <option key={type} value={type}>
                          {type === 'all' ? 'All types' : issueLabel(type)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter severity"
                      value={severity}
                      disabled={filtersDisabled}
                      onChange={event => setSeverity(event.target.value as SeverityFilter)}
                      style={{ height: 28, fontSize: 12 }}
                    >
                      {SEVERITIES.map(item => (
                        <option key={item} value={item}>
                          {item === 'all' ? 'All severities' : item}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              />
              <div className="scroll" style={{ maxHeight: 430 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Column</th>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Value</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentReport && visibleIssues.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ color: 'var(--fg-2)' }}>
                          {hasActiveIssueFilters ? 'No issues match the current filters.' : 'No issues found'}
                        </td>
                      </tr>
                    )}
                    {!currentReport && (
                      <tr>
                        <td colSpan={6} style={{ color: 'var(--fg-2)' }}>
                          No report selected.
                        </td>
                      </tr>
                    )}
                    {visibleIssues.map(issue => (
                      <tr key={issue.id}>
                        <td className="mono">{issue.row_number}</td>
                        <td>{issue.column_name ?? '-'}</td>
                        <td>{issueLabel(issue.issue_type)}</td>
                        <td>
                          <Pill
                            tone={
                              issue.severity === 'error'
                                ? 'danger'
                                : issue.severity === 'warning'
                                  ? 'warn'
                                  : 'info'
                            }
                          >
                            {issue.severity}
                          </Pill>
                        </td>
                        <td className="mono">{issue.value_preview ?? '-'}</td>
                        <td>{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
