// ── Review Queue — terminal aesthetic, card-first ──

import { useCallback, useMemo, useRef, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { AlertTriangleIcon, ArrowRightIcon, SplitIcon } from "lucide-react";
import { api } from "../api/client";
import { useRecordType } from "../hooks/useRecordTypes";
import { useMatchRun } from "../hooks/useMatchRun";
import { fieldSummary } from "../utils/recordDisplay";
import { relativeTime } from "../utils/time";
import { confidenceTone } from "../utils/confidence";
import { useSearch } from "../contexts/SearchContext";
import { useSelectedRecordType } from "../contexts/RecordTypeContext";
import type {
  ReviewQueueResponse,
  ReviewActionResponse,
  ReviewStats,
} from "../api/types";
import { Card, CardHeader, CardContent, CardFooter } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { LoadingErrorEmpty } from "../components/ui/LoadingErrorEmpty";
import Pagination from "../components/Pagination";
import WorkflowStageRail from "../components/WorkflowStageRail";
import HandoffBanner from "../components/HandoffBanner";
import MatchRunSelect from "../components/MatchRunSelect";
import QueueBucketTabs from "../components/QueueBucketTabs";


// ── Constants ────────────────────────────────────────

type BucketFilter = "pending" | "confirmed" | "rejected";

const BUCKETS: {
  id: BucketFilter;
  label: string;
  desc: string;
  tone: string;
}[] = [
  { id: "pending", label: "Pending", desc: "awaiting decision", tone: "warn" },
  {
    id: "confirmed",
    label: "Confirmed dupe",
    desc: "→ sent to merge",
    tone: "ok",
  },
  {
    id: "rejected",
    label: "Not a dupe",
    desc: "split into separate",
    tone: "danger",
  },
];

const PAGE_SIZE = 20;

// ── Small helpers ────────────────────────────────────

// Small confidence ring — SVG donut centred on a number
function ConfRing({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = confidenceTone(value);
  const r = 16;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ position: "relative", width: 48, height: 48 }}>
      <svg
        viewBox="0 0 40 40"
        style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}
      >
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="3"
        />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          className={tone === 'ok' ? 'stroke-emerald-600' : tone === 'warn' ? 'stroke-amber-600' : 'stroke-destructive'}
          strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          className={`font-mono tabular-nums text-[11px] font-semibold leading-none ${tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-destructive'}`}
        >
          {pct}
        </span>
        <span className="text-muted-foreground/60 uppercase tracking-wider" style={{ fontSize: 7 }}>
          conf
        </span>
      </div>
    </div>
  );
}

// Source pill fixed to record-identity color
function RecordPill({ short, tone }: { short: string; tone: "a" | "b" }) {
  const className =
    tone === "a"
      ? "font-mono inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-primary/10 border border-primary/20 text-primary"
      : "font-mono inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-sky-100 border border-sky-200 text-sky-700 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-300";
  return (
    <span className={className}>
      {short.toUpperCase()}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────

export default function ReviewQueue() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { query: searchQuery } = useSearch();
  const { selectedType, withRecordType } = useSelectedRecordType();
  const { runId, validRuns, selectedRun, setRunId } =
    useMatchRun(selectedType);
  const { data: recordType } = useRecordType(selectedType);
  const summaryFieldKeys =
    recordType?.fields
      .filter((field) => field.role !== "name")
      .map((field) => field.key) ?? [];
  const runReady =
    selectedRun?.status === "completed" || selectedRun?.status === "stale";

  const [bucket, setBucket] = useState<BucketFilter>("pending");
  const [minConfidence, setMinConfidence] = useState(0);
  const [pageState, setPageState] = useState({ type: selectedType, page: 0 });
  const page = pageState.type === selectedType ? pageState.page : 0;
  const tableRef = useRef<HTMLDivElement>(null);

  const setPage = useCallback(
    (nextPage: number) => {
      setPageState({ type: selectedType, page: nextPage });
    },
    [selectedType],
  );

  const handlePageChange = (p: number) => {
    setPage(p);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("status", bucket);
    if (minConfidence > 0)
      p.set("min_confidence", (minConfidence / 100).toFixed(2));
    if (runId) p.set("match_run_id", runId);
    p.set("limit", String(PAGE_SIZE));
    p.set("type", selectedType);
    p.set("offset", String(page * PAGE_SIZE));
    return p;
  }, [bucket, minConfidence, runId, page, selectedType]);

  const { data: queue, isLoading } = useQuery({
    queryKey: [
      "review-queue",
      bucket,
      minConfidence,
      page,
      selectedType,
      runId,
    ],
    queryFn: () =>
      api.get<ReviewQueueResponse>(`/api/review/queue?${params.toString()}`),
    placeholderData: keepPreviousData,
    enabled: !!runId && runReady,
  });

  const { data: stats } = useQuery({
    queryKey: ["review-stats", selectedType, runId],
    queryFn: () =>
      api.get<ReviewStats>(
        `/api/review/stats?type=${selectedType}${runId ? `&match_run_id=${runId}` : ""}`,
      ),
    enabled: !!runId && runReady,
    placeholderData: keepPreviousData,
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({
        queryKey: ["review-stats", selectedType, runId],
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      api.post<ReviewActionResponse>(`/api/review/candidates/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      queryClient.invalidateQueries({
        queryKey: ["review-stats", selectedType, runId],
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const bucketCounts: Record<BucketFilter, number> = {
    pending: stats?.total_pending ?? 0,
    confirmed: stats?.total_confirmed ?? 0,
    rejected: stats?.total_rejected ?? 0,
  };

  const filteredItems = useMemo(() => {
    if (!queue?.items) return [];
    if (!searchQuery) return queue.items;
    const q = searchQuery.toLowerCase();
    return queue.items.filter(
      (item) =>
        item.record_a_name?.toLowerCase().includes(q) ||
        item.record_b_name?.toLowerCase().includes(q) ||
        item.record_a_source?.toLowerCase().includes(q) ||
        item.record_b_source?.toLowerCase().includes(q),
    );
  }, [queue, searchQuery]);

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-5">
        <WorkflowStageRail
          activeStage="review"
          match={{
            onClick: () => navigate(withRecordType("/match")),
            title: "Go to Match runs",
          }}
          merge={{
            onClick: () =>
              navigate(
                withRecordType(runId ? `/merge?match_run_id=${runId}` : "/merge"),
              ),
            title: "Go to Merge queue",
          }}
          unified={{
            onClick: () => navigate(withRecordType("/unified")),
            title: "Go to Unified records",
          }}
        />

        <HandoffBanner
          icon={SplitIcon}
          text={
            <>
              items confirmed here move to the{" "}
              <span className="font-semibold text-foreground">
                Merge queue
              </span>{" "}
              for field-level reconciliation by a data steward.
            </>
          }
          note="auto-routed · no merging on this screen"
        />

        {/* ── Stale warning ── */}
        {selectedRun?.status === "stale" && (
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 mb-2 text-xs text-amber-600 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 border border-border rounded-md">
            <AlertTriangleIcon className="size-3 shrink-0" />
            Source data has changed since this run — results may be outdated
          </div>
        )}

        {/* ── Title row ── */}
        {/* ── Bucket tabs ── */}
        <QueueBucketTabs
          buckets={BUCKETS}
          active={bucket}
          counts={bucketCounts}
          onChange={(id) => {
            setBucket(id as BucketFilter);
            setPage(0);
          }}
        />

        {/* ── Filters ── */}
        <Card>
          <CardHeader className="flex-row items-center justify-between flex-wrap gap-3 border-b pb-3">
            <MatchRunSelect
              validRuns={validRuns}
              runId={runId}
              onChange={(id) => {
                setRunId(id);
                setPage(0);
              }}
            />
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-muted-foreground">min confidence</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minConfidence}
                onChange={(e) => {
                  setMinConfidence(Number(e.target.value));
                  setPage(0);
                }}
                className="w-30 accent-primary"
                style={{ width: 120 }}
                aria-label="Minimum confidence"
              />
              <span className="font-mono tabular-nums text-[11px] w-9">
                {(minConfidence / 100).toFixed(2)}
              </span>
            </div>
          </CardHeader>

          {/* Top pagination */}
          {queue && queue.total > PAGE_SIZE && (
            <div
              ref={tableRef}
              className="px-3.5 py-2 border-b scroll-mt-14"
            >
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                totalItems={queue.total}
                onPageChange={handlePageChange}
              />
            </div>
          )}

          {/* Card list */}
          <CardContent className="p-3 flex flex-col gap-2">
            <LoadingErrorEmpty
              loading={isLoading && !queue}
              empty={!runId || !runReady || filteredItems.length === 0}
              emptyMessage={
                !runId
                  ? "Select a run above to load the review queue."
                  : !runReady
                    ? `Matching run #${runId} is still processing.`
                    : "No candidates match the current filters."
              }
            >
              <>
                {filteredItems.map((item, i) => {
                  const isPending = item.status === "pending";
                  const statusTone =
                    item.status === "confirmed"
                      ? "ok"
                      : item.status === "rejected"
                        ? "danger"
                        : null;
                  const recordASummary = fieldSummary(
                    item.record_a_fields as Record<string, unknown>,
                    summaryFieldKeys,
                  );
                  const recordBSummary = fieldSummary(
                    item.record_b_fields as Record<string, unknown>,
                    summaryFieldKeys,
                  );

                  return (
                    <div
                      key={item.id}
                      className={`review-card bg-card rounded-md overflow-hidden border border-border transition-all duration-150 hover:-translate-y-px hover:shadow-md border-l-[3px] ${statusTone === 'ok' ? 'border-l-emerald-600' : statusTone === 'danger' ? 'border-l-destructive' : 'border-l-transparent'}`}
                      style={{
                        opacity: !isPending ? 0.75 : 1,
                        animation: "fadeIn 0.2s ease both",
                        animationDelay: `${i * 35}ms`,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 80px 1fr 260px",
                          alignItems: "stretch",
                        }}
                      >
                        {/* ── Record A ── */}
                        <div
                          className="p-3.5 border-r border-border border-l-[3px] border-l-primary/30"
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <RecordPill
                              short={item.record_a_source ?? "?"}
                              tone="a"
                            />
                          </div>
                          <div className="text-sm font-semibold leading-snug tracking-tight text-foreground">
                            {item.record_a_name || "—"}
                          </div>
                          {recordASummary && (
                            <div className="font-mono text-[11px] text-muted-foreground mt-1">
                              {recordASummary}
                            </div>
                          )}
                        </div>

                        {/* ── Confidence ring + age ── */}
                        <div className="p-3.5 border-r border-border bg-muted flex flex-col items-center justify-center gap-1.5">
                          <ConfRing value={item.confidence} />
                          <span className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider">
                            {relativeTime(item.created_at)}
                          </span>
                        </div>

                        {/* ── Record B ── */}
                        <div
                          className="p-3.5 border-r border-border border-l-[3px] border-l-sky-300 dark:border-l-sky-700"
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <RecordPill
                              short={item.record_b_source ?? "?"}
                              tone="b"
                            />
                          </div>
                          <div className="text-sm font-semibold leading-snug tracking-tight text-foreground">
                            {item.record_b_name || "—"}
                          </div>
                          {recordBSummary && (
                            <div className="font-mono text-[11px] text-muted-foreground mt-1">
                              {recordBSummary}
                            </div>
                          )}
                        </div>

                        {/* ── Decision column ── */}
                        <div className="p-3 flex flex-col gap-1.5 justify-center">
                          {!isPending ? (
                            <Badge
                              variant={statusTone === "ok" ? "secondary" : "destructive"}
                              className={
                                statusTone === "ok"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 justify-center"
                                  : "justify-center"
                              }
                            >
                              {item.status === "confirmed"
                                ? "Confirmed dupe"
                                : "Not a duplicate"}
                            </Badge>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmMutation.mutate(item.id);
                                  }}
                                  disabled={
                                    confirmMutation.isPending ||
                                    rejectMutation.isPending
                                  }
                                  className="px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide flex items-center justify-center gap-1 rounded-sm border border-emerald-600 text-emerald-600 bg-transparent transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/50 disabled:opacity-50 disabled:cursor-default"
                                >
                                  ✓ Same
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    rejectMutation.mutate(item.id);
                                  }}
                                  disabled={rejectMutation.isPending}
                                  className="px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide flex items-center justify-center gap-1 rounded-sm border border-destructive text-destructive bg-transparent transition-colors hover:bg-destructive/10 disabled:opacity-50"
                                >
                                  ✕ Diff
                                </button>
                              </div>
                              <div className="border-t border-border pt-1.5 mt-0.5">
                                <button
                                  onClick={() =>
                                    navigate(
                                      withRecordType(`/review/${item.id}`),
                                    )
                                  }
                                  className="w-full py-1 px-2 font-mono text-[11px] text-primary flex items-center justify-center gap-1 tracking-wide transition-opacity hover:opacity-70 bg-transparent border-none"
                                >
                                  See evidence
                                  <ArrowRightIcon className="size-3" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            </LoadingErrorEmpty>
          </CardContent>

          {/* Bottom pagination */}
          {queue && queue.total > 0 && (
            <CardFooter className="px-3.5 py-2 border-t bg-transparent">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                totalItems={queue.total}
                onPageChange={handlePageChange}
              />
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
