import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheckIcon, UploadIcon } from 'lucide-react';
import { api } from '../api/client';
import type {
  FileCheckIssue,
  FileCheckReport,
  FileCheckReportDetail,
  FileCheckReportListResponse,
} from '../api/types';
import Kpi from '../components/ui/Kpi';
import Spinner from '../components/ui/Spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardAction } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { formatFileSize } from '../utils/filesize';

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

function statusBadge(status: FileCheckReport['status']) {
  if (status === 'clean') {
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{status}</Badge>;
  }
  if (status === 'warning') {
    return <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">{status}</Badge>;
  }
  if (status === 'failed' || status === 'error') {
    return <Badge variant="destructive">{status}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

function severityBadge(severity: FileCheckIssue['severity']) {
  if (severity === 'error') {
    return <Badge variant="destructive">{severity}</Badge>;
  }
  if (severity === 'warning') {
    return <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">{severity}</Badge>;
  }
  return <Badge variant="secondary" className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">{severity}</Badge>;
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
    <div className="overflow-auto h-full p-4">
      <div className="max-w-[1240px] mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold">File checker</h1>
          <p className="mt-1.5 text-muted-foreground text-sm">
            Check CSV/TSV files for missing rows and quality issues outside the ingestion pipeline.
          </p>
        </header>

        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' }}>
          <div className="flex flex-col gap-3.5 min-w-0">
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
              className={[
                'min-h-[180px] border border-dashed rounded-md bg-background text-muted-foreground flex items-center justify-center p-5',
                isDragging ? 'border-primary' : 'border-border',
              ].join(' ')}
            >
              <input
                ref={inputRef}
                aria-label="Upload CSV or TSV file"
                type="file"
                accept=".csv,.tsv,text/csv,text/tab-separated-values"
                disabled={uploadMutation.isPending}
                className="hidden"
                onChange={event => uploadFile(event.target.files?.[0])}
              />
              <div className="text-center max-w-[260px]">
                <ClipboardCheckIcon className="size-7 text-muted-foreground mb-2.5 mx-auto" aria-hidden="true" />
                <div className="text-sm font-semibold text-foreground">Drop CSV or TSV file here</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  className="mt-3"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Spinner size={12} />
                      Checking
                    </>
                  ) : (
                    <>
                      <UploadIcon className="size-3.5" aria-hidden="true" />
                      Browse
                    </>
                  )}
                </Button>
                {uploadMutation.isError && (
                  <div
                    role="alert"
                    className="mt-3 w-full flex justify-center"
                  >
                    <Badge variant="destructive">
                      {errorMessage(uploadMutation.error)}
                    </Badge>
                  </div>
                )}
              </div>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Report history</CardTitle>
              </CardHeader>
              <CardContent className="min-h-[160px]">
                {historyIsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Spinner size={14} />
                    <span>Loading reports</span>
                  </div>
                ) : historyIsError ? (
                  <div>
                    <div className="text-destructive text-sm font-semibold">
                      Could not load file check history
                    </div>
                    <div className="mt-1 text-muted-foreground text-xs">
                      Refresh the page or try again later.
                    </div>
                  </div>
                ) : reportItems.length === 0 ? (
                  <span className="text-muted-foreground text-xs">No file checks yet</span>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {reportItems.map(report => (
                      <Button
                        key={report.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={selectedReportId === report.id}
                        onClick={() => {
                          setSelectedReportId(report.id);
                          setIssueType('all');
                          setSeverity('all');
                        }}
                        className={[
                          'justify-between w-full min-h-[40px]',
                          selectedReportId === report.id ? 'border-primary' : 'border-border',
                        ].join(' ')}
                      >
                        <span className="min-w-0 text-left">
                          <span className="block text-foreground text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                            {report.original_filename}
                          </span>
                          <span className="block text-muted-foreground text-[10px] font-mono">
                            {formatDate(report.completed_at ?? report.created_at)}
                          </span>
                        </span>
                        {statusBadge(report.status)}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-3.5 min-w-0">
            <Card>
              <CardHeader>
                <CardTitle>{currentReport ? currentReport.original_filename : 'Current report'}</CardTitle>
                {currentReport && (
                  <CardAction>{statusBadge(currentReport.status)}</CardAction>
                )}
              </CardHeader>
              <CardContent>
                {detailQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Spinner size={14} />
                    <span>Loading report</span>
                  </div>
                ) : detailQuery.isError ? (
                  <div role="alert" className="flex">
                    <Badge variant="destructive">
                      {errorMessage(detailQuery.error)}
                    </Badge>
                  </div>
                ) : currentReport ? (
                  <div className="flex flex-col gap-3.5">
                    <div
                      className="grid gap-2.5"
                      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}
                    >
                      <Kpi label="Total rows" value={formatNumber(currentReport.total_rows)} />
                      <Kpi
                        label="Rows with issues"
                        value={formatNumber(currentReport.rows_with_issues)}
                        delta={
                          currentReport.rows_with_issues > 0
                            ? { value: 'has issues', tone: 'negative' }
                            : { value: 'none', tone: 'positive' }
                        }
                      />
                      <Kpi label="Empty rows" value={formatNumber(currentReport.empty_row_count)} />
                      <Kpi
                        label="Missing values"
                        value={formatNumber(currentReport.missing_value_count)}
                      />
                      <Kpi
                        label="Corrupted values"
                        value={formatNumber(currentReport.corrupted_value_count)}
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-mono text-muted-foreground">
                        {formatFileSize(currentReport.file_size_bytes)}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        delimiter {currentReport.delimiter === '\t' ? 'tab' : currentReport.delimiter}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {formatNumber(currentReport.issue_total)} issues
                      </span>
                    </div>
                    {currentReport.issue_cap_reached && (
                      <Badge
                        aria-live="polite"
                        variant="secondary"
                        className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      >
                        Issue cap reached. Showing stored issues only.
                      </Badge>
                    )}
                    {hasPartialIssues && (
                      <Badge
                        aria-live="polite"
                        variant="secondary"
                        className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      >
                        Showing first {formatNumber(loadedIssueCount)} of {formatNumber(currentReport.issue_total)} issues.
                        Filters apply to loaded issues.
                      </Badge>
                    )}
                    {currentReport.status === 'error' && currentReport.error_message && (
                      <div role="alert">
                        <Badge variant="destructive">
                          {currentReport.error_message}
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">Select or upload a report.</span>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Issues</CardTitle>
                <CardAction>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      aria-label="Filter issue type"
                      value={issueType}
                      disabled={filtersDisabled}
                      onChange={event => setIssueType(event.target.value as IssueTypeFilter)}
                      className="h-7 text-xs rounded border border-border bg-background px-2"
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
                      className="h-7 text-xs rounded border border-border bg-background px-2"
                    >
                      {SEVERITIES.map(item => (
                        <option key={item} value={item}>
                          {item === 'all' ? 'All severities' : item}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardAction>
              </CardHeader>
              <ScrollArea className="max-h-[430px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Column</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentReport && visibleIssues.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          {hasActiveIssueFilters ? 'No issues match the current filters.' : 'No issues found'}
                        </TableCell>
                      </TableRow>
                    )}
                    {!currentReport && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          No report selected.
                        </TableCell>
                      </TableRow>
                    )}
                    {visibleIssues.map(issue => (
                      <TableRow key={issue.id}>
                        <TableCell className="font-mono">{issue.row_number}</TableCell>
                        <TableCell>{issue.column_name ?? '-'}</TableCell>
                        <TableCell>{issueLabel(issue.issue_type)}</TableCell>
                        <TableCell>
                          {severityBadge(issue.severity)}
                        </TableCell>
                        <TableCell className="font-mono">{issue.value_preview ?? '-'}</TableCell>
                        <TableCell>{issue.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
