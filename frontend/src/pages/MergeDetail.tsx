// ── Merge Detail — field reconciliation for confirmed duplicate pairs ──

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  CircleIcon,
  MergeIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { api } from "../api/client";
import type { MatchDetailResponse, ReviewActionResponse } from "../api/types";
import { confidenceTone } from "../utils/confidence";
import { useRecordType } from "../hooks/useRecordTypes";
import { useSelectedRecordType } from "../contexts/RecordTypeContext";
import { fieldValue } from "../utils/recordDisplay";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import IdChip from "../components/ui/IdChip";
import SourcePill from "../components/ui/SourcePill";
import MatchSignalsPanel from "../components/MatchSignalsPanel";
import FieldComparisonPanel from "../components/FieldComparisonPanel";
import {
  type Layout,
  LAYOUT_KEY,
  getInitialLayout,
} from "../components/fieldComparisonLayout";

export default function MergeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { withRecordType } = useSelectedRecordType();

  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>(getInitialLayout);
  const [selections, setSelections] = useState<Record<string, number>>({});

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);

  const {
    data: detail,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["review-detail", id],
    queryFn: () => api.get<MatchDetailResponse>(`/api/review/candidates/${id}`),
    enabled: !!id,
  });

  const { data: recordType } = useRecordType(detail?.type);

  const isConfirmed = detail?.status === "confirmed";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["merge-queue"] });
    queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    queryClient.invalidateQueries({ queryKey: ["review-stats"] });
    queryClient.invalidateQueries({ queryKey: ["review-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["unified-records"] });
    setActionInFlight(null);
  };

  const mergeMutation = useMutation({
    mutationFn: (
      fieldSelections: { field: string; chosen_record_id: number }[],
    ) =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/merge`, {
        field_selections: fieldSelections,
      }),
    onSuccess: (result) => {
      invalidate();
      if (result.unified_record_id) {
        navigate(withRecordType(`/unified/${result.unified_record_id}`));
      } else {
        navigate(withRecordType("/merge"));
      }
    },
    onError: () => setActionInFlight(null),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/reject`),
    onSuccess: () => {
      invalidate();
      navigate(withRecordType("/merge"));
    },
    onError: () => setActionInFlight(null),
  });

  const handleMerge = () => {
    if (!detail) return;
    const fieldSelections = Object.entries(selections).map(
      ([field, chosen_record_id]) => ({
        field,
        chosen_record_id,
      }),
    );
    setActionInFlight("merge");
    mergeMutation.mutate(fieldSelections);
  };

  const handleReject = () => {
    setActionInFlight("reject");
    rejectMutation.mutate();
  };

  // Keyboard: Enter = merge (when resolved), R = reject, S = skip back
  useEffect(() => {
    if (!isConfirmed) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.tagName === "INPUT" ||
        t?.tagName === "TEXTAREA" ||
        t?.isContentEditable
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === "r" || e.key === "R") && !actionInFlight) {
        e.preventDefault();
        handleReject();
      } else if (e.key === "Enter" && !actionInFlight && allResolved) {
        e.preventDefault();
        handleMerge();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, actionInFlight, selections, detail]);

  if (isLoading) {
    return (
      <div className="overflow-y-auto h-full">
        <div className="p-5 text-xs text-muted-foreground">
          Loading candidate…
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="overflow-y-auto h-full">
        <div className="p-5">
          <Card>
            <CardContent className="py-7 text-center">
              <XCircleIcon className="size-7 text-destructive mx-auto" />
              <div className="mt-2 text-xs">
                {error instanceof Error
                  ? error.message
                  : "Match candidate not found"}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(withRecordType("/merge"))}
                className="mt-3 gap-1"
              >
                <ArrowLeftIcon className="size-3" />
                Back to merge queue
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { record_a, record_b, field_comparisons, match_signals } = detail;
  const tone = confidenceTone(detail.confidence);
  const conflicts = field_comparisons.filter((f) => f.is_conflict);
  const resolvedCount = conflicts.filter(
    (f) => selections[f.field] !== undefined,
  ).length;
  const allResolved =
    conflicts.length === 0 || resolvedCount === conflicts.length;

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-5 pb-20">
        {/* Header */}
        <div className="mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(withRecordType("/merge"))}
            className="mb-2 gap-1"
          >
            <ArrowLeftIcon className="size-3" />
            Merge queue
          </Button>
          <div className="flex items-center gap-2.5 flex-wrap">
            <IdChip className="text-[13px] px-2 py-0.5">
              #{detail.id}
            </IdChip>
            <h1 className="text-[18px] font-semibold m-0 min-w-0">
              {record_a.name || `Record #${record_a.id}`}{" "}
              <span className="text-muted-foreground font-normal">↔</span>{" "}
              {record_b.name || `Record #${record_b.id}`}
            </h1>
            <Badge
              variant="secondary"
              className={
                tone === "ok"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : tone === "warn"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : tone === "danger"
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
              }
            >
              <CircleIcon className="size-2 fill-current" />
              {detail.confidence.toFixed(3)} confidence
            </Badge>
            {conflicts.length > 0 && (
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              >
                <AlertTriangleIcon className="size-3" />
                {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {!isConfirmed && (
              <Badge
                variant={
                  detail.status === "merged"
                    ? "secondary"
                    : detail.status === "rejected"
                      ? "destructive"
                      : "outline"
                }
                className={
                  detail.status === "merged"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : undefined
                }
              >
                <CircleIcon className="size-2 fill-current" />
                {detail.status}
                {detail.reviewed_by && (
                  <span className="font-mono ml-1 opacity-70">
                    · {detail.reviewed_by}
                  </span>
                )}
              </Badge>
            )}
          </div>
          {detail.reviewed_by && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              Confirmed by{" "}
              <span className="font-mono text-primary">
                {detail.reviewed_by}
              </span>
              {detail.reviewed_at && (
                <span> · {new Date(detail.reviewed_at).toLocaleString()}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 mt-1.5 text-[11px] text-muted-foreground">
            {(() => {
              const codeField = recordType?.fields.find(
                (f) => f.role === "code",
              );
              return (
                <>
                  {record_a.data_source_name && (
                    <span className="inline-flex items-center gap-1.5">
                      <SourcePill short={record_a.data_source_name} />
                      <span className="font-mono">
                        {codeField
                          ? fieldValue(record_a.fields, codeField.key)
                          : `#${record_a.id}`}
                      </span>
                    </span>
                  )}
                  {record_b.data_source_name && (
                    <span className="inline-flex items-center gap-1.5">
                      <SourcePill short={record_b.data_source_name} />
                      <span className="font-mono">
                        {codeField
                          ? fieldValue(record_b.fields, codeField.key)
                          : `#${record_b.id}`}
                      </span>
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Signals */}
        <MatchSignalsPanel
          signals={match_signals}
          confidence={detail.confidence}
          tone={tone}
        />

        {/* Field comparison — interactive for conflicts */}
        <FieldComparisonPanel
          comparisons={field_comparisons}
          recordA={record_a}
          recordB={record_b}
          layout={layout}
          onLayoutChange={setLayout}
          conflictCount={conflicts.length}
          resolvedCount={resolvedCount}
          selections={selections}
          onSelect={
            isConfirmed
              ? (field, id) => setSelections((s) => ({ ...s, [field]: id }))
              : undefined
          }
        />

        {/* Sticky verdict bar */}
        {isConfirmed && (
          <div className="sticky bottom-0 bg-card border border-border rounded-md px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <div
                className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                  allResolved
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                <span className="font-mono tabular-nums">
                  {resolvedCount}/{conflicts.length}
                </span>{" "}
                conflicts resolved
              </div>
              <span className="text-xs text-muted-foreground">
                {allResolved
                  ? conflicts.length === 0
                    ? "No conflicts — ready to merge"
                    : "All conflicts reconciled — ready to merge"
                  : "Pick a side for each conflicting field"}
              </span>
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReject}
                disabled={actionInFlight !== null}
                className="gap-1"
              >
                <XIcon className="size-3" />
                {actionInFlight === "reject" ? "Rejecting…" : "Reject"}
                <span className="kbd">R</span>
              </Button>
              <Button
                size="sm"
                onClick={handleMerge}
                disabled={!allResolved || actionInFlight !== null}
                className="gap-1"
              >
                <MergeIcon className="size-3" />
                {actionInFlight === "merge" ? "Merging…" : "Confirm merge"}
                <span
                  className="kbd"
                  style={{
                    background: "rgba(255,255,255,0.18)",
                    color: "#fff",
                    borderColor: "rgba(255,255,255,0.25)",
                  }}
                >
                  ↵
                </span>
              </Button>
            </div>
          </div>
        )}

        {/* Post-action banners */}
        {!isConfirmed && detail.status === "merged" && (
          <div className="mt-2.5 px-3.5 py-2.5 bg-emerald-100 dark:bg-emerald-950 border border-emerald-600/30 rounded-md flex items-center gap-2 text-xs">
            <CheckCircle2Icon className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
              Merged
            </span>
            <span className="text-muted-foreground">
              — unified record created in Unified records
            </span>
          </div>
        )}
        {!isConfirmed && detail.status === "rejected" && (
          <div className="mt-2.5 px-3.5 py-2.5 bg-destructive/10 border border-destructive/30 rounded-md flex items-center gap-2 text-xs">
            <XCircleIcon className="size-3.5 text-destructive shrink-0" />
            <span className="text-destructive font-semibold">Rejected</span>
            {detail.reviewed_by && (
              <span className="text-muted-foreground">
                — reviewed by{" "}
                <span className="font-mono">{detail.reviewed_by}</span>
              </span>
            )}
          </div>
        )}

        {(mergeMutation.error || rejectMutation.error) && (
          <Badge
            variant="destructive"
            className="mt-2.5 w-full justify-start px-2.5 py-1.5 gap-1.5"
          >
            <XCircleIcon className="size-3 shrink-0" />
            {(mergeMutation.error as Error)?.message ||
              (rejectMutation.error as Error)?.message}
          </Badge>
        )}
      </div>
    </div>
  );
}
