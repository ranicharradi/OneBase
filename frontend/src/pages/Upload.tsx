// ── Upload — multi-step file ingestion with explicit source selection ──

import { useCallback, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, XCircleIcon, CloudUploadIcon } from "lucide-react";
import { api, probeSourceOverlap } from "../api/client";
import type {
  BatchResponse,
  DataSource,
  DataSourceCreate,
  DiffPreviewResponse,
  OverlapMatch,
  UploadResponse,
} from "../api/types";
import DropZone from "../components/DropZone";
import ProgressTracker from "../components/ProgressTracker";
import ColumnMapper from "../components/ColumnMapper";
import ReUploadDialog from "../components/ReUploadDialog";
import SourceOverlapDialog from "../components/SourceOverlapDialog";
import BatchHistory from "../components/BatchHistory";
import Spinner from "../components/ui/Spinner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { useRecordType, useRecordTypes } from "../hooks/useRecordTypes";
import { parseFileHeaders } from "../utils/fileHeaders";
import { defaultType } from "../utils/recordDisplay";

type UploadState =
  | { step: "PICK_SOURCE" }
  | { step: "DROP_FILE"; sourceId: number }
  | { step: "DETECTING"; sourceId: number; file: File }
  | {
      step: "MAP_COLUMNS";
      file: File;
      columns: string[];
      suggestedName: string;
      detectedDelimiter: string;
      detectedFormat: "csv" | "xlsx";
      type: string;
    }
  | { step: "PROCESSING"; taskId: string };

const STEPS = [
  { label: "Select source" },
  { label: "Upload file" },
  { label: "Ingest" },
];

function stepIndex(state: UploadState): number {
  switch (state.step) {
    case "PICK_SOURCE":
      return 0;
    case "DROP_FILE":
      return 1;
    case "DETECTING":
      return 1;
    case "MAP_COLUMNS":
      return 1;
    case "PROCESSING":
      return 2;
  }
}

function Stepper({ state }: { state: UploadState }) {
  const idx = stepIndex(state);
  return (
    <Card size="sm" className="mb-3.5">
      <CardContent className="py-2.5">
        <div className="flex gap-4">
          {STEPS.map((s, i) => {
            const active = i === idx;
            const done = i < idx;
            return (
              <div
                key={i}
                className="flex items-center gap-2"
                style={{ flex: i < STEPS.length - 1 ? "1 1 0" : "0 0 auto" }}
              >
                <div
                  className={[
                    "flex size-[22px] shrink-0 items-center justify-center rounded font-mono text-[11px] font-semibold",
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {done ? (
                    <CheckIcon className="size-3" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={[
                    "text-xs",
                    active
                      ? "font-semibold text-foreground"
                      : done
                        ? "text-foreground/80"
                        : "text-muted-foreground",
                  ].join(" ")}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={[
                      "h-px flex-1",
                      done ? "bg-emerald-500" : "bg-border",
                    ].join(" ")}
                  />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Upload() {
  const queryClient = useQueryClient();
  const [uploadState, setUploadState] = useState<UploadState>({
    step: "PICK_SOURCE",
  });
  const [showReUpload, setShowReUpload] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [reUploadPreview, setReUploadPreview] = useState<DiffPreviewResponse>({
    inserted: 0,
    updated: 0,
    retired: 0,
    unchanged: 0,
  });
  const [forceReplace, setForceReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [overlapMatches, setOverlapMatches] = useState<OverlapMatch[]>([]);
  const [pendingNewSource, setPendingNewSource] = useState<DataSourceCreate | null>(null);
  const [isProbingOverlap, setIsProbingOverlap] = useState(false);
  const isProbingOverlapRef = useRef(false);

  const { data: sources } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.get<DataSource[]>("/api/sources"),
  });

  const { data: recordTypes } = useRecordTypes();
  const { data: activeRecordType } = useRecordType(
    uploadState.step === "MAP_COLUMNS" ? uploadState.type : null,
  );

  const uploadWithFileMutation = useMutation({
    mutationFn: async ({
      file,
      dataSourceId,
      forceReplace: fr,
    }: {
      file: File;
      dataSourceId: number;
      forceReplace?: boolean;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("data_source_id", String(dataSourceId));
      if (fr) formData.append("force_replace", "true");
      return api.upload<UploadResponse>("/api/import/upload", formData);
    },
    onSuccess: (data) => {
      setUploadComplete(false);
      setUploadState({ step: "PROCESSING", taskId: data.task_id });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const createSourceMutation = useMutation({
    mutationFn: async (sourceData: DataSourceCreate) =>
      api.post<DataSource>("/api/sources", sourceData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
  });

  const checkAndUpload = useCallback(
    async (sourceId: number, file: File) => {
      try {
        const batches = await api.get<BatchResponse[]>(
          `/api/import/batches?data_source_id=${sourceId}`,
        );
        if (batches && batches.length > 0) {
          try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("data_source_id", String(sourceId));
            const preview = await api.upload<DiffPreviewResponse>("/api/import/preview", fd);
            setReUploadPreview(preview);
          } catch {
            setReUploadPreview({ inserted: 0, updated: 0, retired: 0, unchanged: 0 });
          }
          setPendingSourceId(sourceId);
          setPendingFile(file);
          setForceReplace(false);
          setUploadState({ step: "DROP_FILE", sourceId });
          setShowReUpload(true);
          return;
        }
      } catch {
        // proceed with upload if check fails
      }
      await uploadWithFileMutation.mutateAsync({
        file,
        dataSourceId: sourceId,
      });
    },
    [uploadWithFileMutation],
  );

  const handleFileDropped = useCallback(
    async (sourceId: number, file: File) => {
      setError(null);
      setUploadState({ step: "DETECTING", sourceId, file });
      try {
        await checkAndUpload(sourceId, file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setUploadState({ step: "DROP_FILE", sourceId });
      }
    },
    [checkAndUpload],
  );

  const handleCreateFromFile = useCallback(
    async (file: File) => {
      setError(null);
      const type = defaultType(recordTypes?.types);
      if (!type) {
        setError("No record types are available for source creation");
        return;
      }
      try {
        const parsed = await parseFileHeaders(file);
        const suggestedName = file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        setUploadState({
          step: "MAP_COLUMNS",
          file,
          columns: parsed.columns,
          suggestedName,
          detectedDelimiter: parsed.delimiter ?? ";",
          detectedFormat: parsed.format,
          type,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to detect file headers",
        );
      }
    },
    [recordTypes],
  );

  const handleReUploadConfirm = () => {
    setShowReUpload(false);
    if (pendingSourceId && pendingFile) {
      uploadWithFileMutation.mutate({
        file: pendingFile,
        dataSourceId: pendingSourceId,
        forceReplace,
      });
    }
  };

  const handleReUploadCancel = () => {
    setShowReUpload(false);
    const sid = pendingSourceId;
    setPendingSourceId(null);
    setPendingFile(null);
    setUploadState(
      sid ? { step: "DROP_FILE", sourceId: sid } : { step: "PICK_SOURCE" },
    );
  };

  const createSourceAndUpload = useCallback(
    async (sourceData: DataSourceCreate, file: File) => {
      const newSource = await createSourceMutation.mutateAsync(sourceData);
      uploadWithFileMutation.mutate({
        file,
        dataSourceId: newSource.id,
      });
    },
    [createSourceMutation, uploadWithFileMutation],
  );

  const handleColumnMapSubmit = async (sourceData: DataSourceCreate) => {
    if (uploadState.step !== "MAP_COLUMNS") return;
    if (isProbingOverlapRef.current) return;
    isProbingOverlapRef.current = true;
    setIsProbingOverlap(true);
    setError(null);
    try {
      const nameField = activeRecordType?.fields.find((field) => field.role === "name");
      const nameColumn = nameField
        ? sourceData.column_mapping[nameField.key]
        : undefined;

      if (typeof nameColumn === "string" && nameColumn.length > 0) {
        try {
          const result = await probeSourceOverlap({
            file: uploadState.file,
            type: sourceData.type,
            name_column: nameColumn,
            delimiter: sourceData.delimiter ?? ",",
          });
          if (result.matches.length > 0) {
            setPendingNewSource(sourceData);
            setOverlapMatches(result.matches);
            return;
          }
        } catch {
          // Overlap probing is advisory; do not block source creation if it is unavailable.
        }
      }

      await createSourceAndUpload(sourceData, uploadState.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create source");
    } finally {
      isProbingOverlapRef.current = false;
      setIsProbingOverlap(false);
    }
  };

  const handleOverlapCreateAnyway = async () => {
    if (uploadState.step !== "MAP_COLUMNS" || !pendingNewSource) return;
    const sourceData = pendingNewSource;
    setOverlapMatches([]);
    setPendingNewSource(null);
    setError(null);
    try {
      await createSourceAndUpload(sourceData, uploadState.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create source");
    }
  };

  const handleOverlapReuploadTo = async (sourceId: number) => {
    if (uploadState.step !== "MAP_COLUMNS") return;
    const file = uploadState.file;
    setOverlapMatches([]);
    setPendingNewSource(null);
    setError(null);
    setUploadState({ step: "DETECTING", sourceId, file });
    try {
      await checkAndUpload(sourceId, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploadState({ step: "DROP_FILE", sourceId });
    }
  };

  const handleOverlapCancel = () => {
    setOverlapMatches([]);
    setPendingNewSource(null);
  };

  const handleReset = () => {
    setUploadState({ step: "PICK_SOURCE" });
    setPendingSourceId(null);
    setPendingFile(null);
    setError(null);
    setUploadComplete(false);
    setOverlapMatches([]);
    setPendingNewSource(null);
    isProbingOverlapRef.current = false;
    setIsProbingOverlap(false);
  };

  const reUploadSourceName = pendingSourceId
    ? (sources?.find((s) => s.id === pendingSourceId)?.name ?? "Source")
    : "Source";

  const isUploading = uploadWithFileMutation.isPending;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1160px] p-5">
        {/* Page title removed to keep upload page fixed-size without scrolling */}

        <Stepper state={uploadState} />

        {error && (
          <Badge
            variant="destructive"
            className="mb-3 w-full justify-start gap-2 px-3 py-2 text-sm"
          >
            <XCircleIcon className="size-4 shrink-0" />
            <span>
              <b>Upload error:</b> {error}
            </span>
          </Badge>
        )}

        {/* PICK_SOURCE */}
        {uploadState.step === "PICK_SOURCE" && (
          <div className="flex flex-col gap-3">
            <Card>
              <CardHeader>
                <CardTitle>Create new source from this file</CardTitle>
                <CardAction>
                  <div className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1">
                    <span className="text-[10px] whitespace-nowrap text-muted-foreground">
                      or existing:
                    </span>
                    <select
                      className="min-w-[90px] cursor-pointer border-none bg-transparent text-[10px] text-primary outline-none"
                      value=""
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val)
                          setUploadState({ step: "DROP_FILE", sourceId: val });
                      }}
                    >
                      <option value="">select…</option>
                      {sources?.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.name} ({source.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent>
                <DropZone onFileSelected={handleCreateFromFile} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* DROP_FILE */}
        {uploadState.step === "DROP_FILE" && (
          <Card>
            <CardHeader>
              <CardTitle>
                Upload to{" "}
                <span className="text-primary">
                  {sources?.find((s) => s.id === uploadState.sourceId)?.name ??
                    `Source #${uploadState.sourceId}`}
                </span>
              </CardTitle>
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUploadState({ step: "PICK_SOURCE" })}
                >
                  Change source
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <DropZone
                onFileSelected={(file) =>
                  handleFileDropped(uploadState.sourceId, file)
                }
                disabled={isUploading}
              />
            </CardContent>
          </Card>
        )}

        {/* DETECTING */}
        {uploadState.step === "DETECTING" && (
          <Card>
            <CardContent className="py-9 text-center">
              <Spinner size={20} className="mx-auto" />
              <div className="mt-2.5 text-[13px] font-medium">
                Checking upload history…
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {uploadState.file.name}
              </div>
            </CardContent>
          </Card>
        )}

        {/* MAP_COLUMNS */}
        {uploadState.step === "MAP_COLUMNS" && (
          <div>
            <ColumnMapper
              columns={uploadState.columns}
              type={uploadState.type}
              onTypeChange={(t) =>
                setUploadState({ ...uploadState, type: t })
              }
              recordTypes={recordTypes}
              onSubmit={handleColumnMapSubmit}
              isSubmitting={
                createSourceMutation.isPending ||
                uploadWithFileMutation.isPending ||
                isProbingOverlap
              }
              initialSourceName={uploadState.suggestedName}
              detectedDelimiter={uploadState.detectedDelimiter}
              recordTypeKey={uploadState.type}
            />
            <div className="mt-3 text-center">
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Start over
              </Button>
            </div>
          </div>
        )}

        {/* PROCESSING */}
        {uploadState.step === "PROCESSING" && (
          <div>
            <ProgressTracker
              taskId={uploadState.taskId}
              onComplete={() => {
                setUploadComplete(true);
                queryClient.invalidateQueries({ queryKey: ["batches"] });
                queryClient.invalidateQueries({ queryKey: ["dashboard"] });
              }}
            />
            {uploadComplete && (
              <>
                <Card size="sm" className="mt-3">
                  <CardContent className="py-2">
                    <span className="font-mono text-[12px] text-foreground/80">
                      Ingest complete ·{" "}
                      <Link to="/match" className="text-primary hover:underline">
                        Compare this file →
                      </Link>
                    </span>
                  </CardContent>
                </Card>
                <div className="mt-2 text-center">
                  <Button size="sm" onClick={handleReset}>
                    <CloudUploadIcon className="size-3.5" />
                    Upload another file
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Recent files — shown when idle or after processing */}
        {(uploadState.step === "PICK_SOURCE" ||
          uploadState.step === "PROCESSING") && (
          <div className="mt-3.5">
            <BatchHistory />
          </div>
        )}
      </div>

      <ReUploadDialog
        open={showReUpload}
        onOpenChange={(o) => { if (!o) handleReUploadCancel(); }}
        sourceName={reUploadSourceName}
        preview={reUploadPreview}
        forceReplace={forceReplace}
        onForceReplaceChange={setForceReplace}
        onConfirm={handleReUploadConfirm}
      />

      <SourceOverlapDialog
        open={overlapMatches.length > 0}
        onOpenChange={(o) => { if (!o) handleOverlapCancel(); }}
        matches={overlapMatches}
        onReuploadTo={handleOverlapReuploadTo}
        onCreateAnyway={handleOverlapCreateAnyway}
      />
    </div>
  );
}
