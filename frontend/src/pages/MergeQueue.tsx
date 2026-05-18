// ── Merge Queue — field reconciliation for confirmed duplicate pairs ──

import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, ArrowRightIcon, GitMergeIcon, HistoryIcon, MergeIcon } from "lucide-react";
import { api } from "../api/client";
import { useSelectedRecordType } from "../contexts/RecordTypeContext";
import { useMatchRun } from "../hooks/useMatchRun";
import { relativeTime } from "../utils/time";
import { confidenceTone } from "../utils/confidence";
import type {
  ReviewQueueItem,
  ReviewQueueResponse,
  ReviewStats,
} from "../api/types";
import { useSearch } from "../contexts/SearchContext";
import { Card, CardHeader, CardContent, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "../components/ui/table";
import { LoadingErrorEmpty } from "../components/ui/LoadingErrorEmpty";
import IdChip from "../components/ui/IdChip";
import SourcePill from "../components/ui/SourcePill";
import Pagination from "../components/Pagination";
import WorkflowStageRail from "../components/WorkflowStageRail";
import HandoffBanner from "../components/HandoffBanner";
import MatchRunSelect from "../components/MatchRunSelect";
import QueueBucketTabs from "../components/QueueBucketTabs";

const PAGE_SIZE = 50;

type BucketFilter = "confirmed" | "merged" | "rejected";

interface Bucket {
  id: BucketFilter;
  label: string;
  tone: string;
  desc: string;
}

const BUCKETS: Bucket[] = [
  {
    id: "confirmed",
    label: "Ready to merge",
    tone: "accent",
    desc: "confirmed dupes awaiting reconciliation",
  },
  {
    id: "merged",
    label: "Merged",
    tone: "ok",
    desc: "field-reconciled unified records created",
  },
  {
    id: "rejected",
    label: "Rejected",
    tone: "danger",
    desc: "not a duplicate",
  },
];

export default function MergeQueue() {
  const navigate = useNavigate();
  const { query: searchQuery } = useSearch();
  const { selectedType, withRecordType } = useSelectedRecordType();
  const { runId, validRuns, selectedRun, setRunId } =
    useMatchRun(selectedType);

  const [bucket, setBucket] = useState<BucketFilter>("confirmed");
  const [pageState, setPageState] = useState({ type: selectedType, page: 0 });
  const page = pageState.type === selectedType ? pageState.page : 0;
  const tableRef = useRef<HTMLDivElement>(null);

  const setPage = useCallback(
    (nextPage: number) => {
      setPageState({ type: selectedType, page: nextPage });
    },
    [selectedType],
  );

  const handlePageChange = useCallback(
    (p: number) => {
      setPage(p);
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [setPage],
  );

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("status", bucket);
    p.set("sort", "confidence_desc");
    p.set("limit", String(PAGE_SIZE));
    p.set("type", selectedType);
    p.set("offset", String(page * PAGE_SIZE));
    if (runId) p.set("match_run_id", runId);
    return p;
  }, [bucket, page, selectedType, runId]);

  const { data: queue, isLoading } = useQuery({
    queryKey: ["merge-queue", bucket, page, selectedType, runId],
    queryFn: () =>
      api.get<ReviewQueueResponse>(`/api/review/queue?${params.toString()}`),
    refetchInterval: 30_000,
    enabled: !!runId,
  });

  const { data: stats } = useQuery({
    queryKey: ["review-stats", selectedType, runId],
    queryFn: () =>
      api.get<ReviewStats>(
        `/api/review/stats?type=${selectedType}${runId ? `&match_run_id=${runId}` : ""}`,
      ),
    refetchInterval: 30_000,
    enabled: !!runId,
  });

  const bucketCounts: Record<BucketFilter, number> = {
    confirmed: stats?.total_confirmed ?? 0,
    merged: stats?.total_merged ?? 0,
    rejected: stats?.total_rejected ?? 0,
  };

  const filteredItems = useMemo<ReviewQueueItem[]>(() => {
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
          activeStage="merge"
          match={{
            onClick: () => navigate(withRecordType("/match")),
            title: "Go to Match runs",
          }}
          review={{
            onClick: () =>
              navigate(
                withRecordType(runId ? `/review?match_run_id=${runId}` : "/review"),
              ),
            title: "Go to Review queue",
          }}
          unified={{
            onClick: () => navigate(withRecordType("/unified")),
            title: "Go to Unified records",
          }}
        />

        <HandoffBanner
          icon={GitMergeIcon}
          text={
            <>
              merged pairs produce a golden record in{" "}
              <span className="font-semibold text-foreground">
                Unified records
              </span>
              .
            </>
          }
          note="field provenance tracked · one record per group"
        />

        {selectedRun?.status === "stale" && (
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 mb-2 text-xs text-amber-600 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 border border-border rounded-md">
            <AlertTriangleIcon className="size-3 shrink-0" />
            Source data has changed since this run — results may be outdated
          </div>
        )}

        {/* ── Title row ── */}
        <QueueBucketTabs
          buckets={BUCKETS}
          active={bucket}
          counts={bucketCounts}
          onChange={(id) => {
            setBucket(id as BucketFilter);
            setPage(0);
          }}
        />

        {/* ── Upstream hint ── */}
        <div className="flex items-center gap-2.5 px-3.5 py-2 mb-3.5 bg-muted border border-border rounded-md text-xs text-foreground/80">
          <HistoryIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span>
            <b>Upstream:</b> these pairs were confirmed as the same record in
            the{" "}
            <a
              onClick={(e) => {
                e.preventDefault();
                navigate(
                  withRecordType(
                    runId ? `/review?match_run_id=${runId}` : "/review",
                  ),
                );
              }}
              href={withRecordType(
                runId ? `/review?match_run_id=${runId}` : "/review",
              )}
              className="text-primary font-semibold cursor-pointer"
            >
              Review queue
            </a>
            . Pick the correct value for each conflicting field.
          </span>
        </div>

        {/* ── Table ── */}
        <div ref={tableRef}>
          <Card>
            <CardHeader className="flex-row items-center gap-3 border-b pb-3">
              <MatchRunSelect
                validRuns={validRuns}
                runId={runId}
                onChange={(id) => {
                  setRunId(id);
                  setPage(0);
                }}
              />
              <span className="font-mono text-[11px] text-muted-foreground ml-auto">
                {runId
                  ? `${queue?.total ?? 0} item${(queue?.total ?? 0) !== 1 ? "s" : ""}`
                  : ""}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <LoadingErrorEmpty
                loading={isLoading && !queue}
                empty={!runId || filteredItems.length === 0}
                emptyMessage={
                  !runId
                    ? "Select a run above to load the merge queue."
                    : bucket === "confirmed"
                      ? "No items awaiting merge — review queue may still be empty."
                      : `No ${BUCKETS.find((b) => b.id === bucket)?.label.toLowerCase()} items.`
                }
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 70 }}>Pair</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead style={{ width: 90 }} className="text-right">
                        Confidence
                      </TableHead>
                      <TableHead style={{ width: 120 }}>Confirmed by</TableHead>
                      <TableHead style={{ width: 90 }}>Age</TableHead>
                      <TableHead style={{ width: 120 }} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item, i) => {
                      const tone = confidenceTone(item.confidence);
                      const toneClass =
                        tone === "ok"
                          ? "text-emerald-600"
                          : tone === "warn"
                            ? "text-amber-600"
                            : tone === "danger"
                              ? "text-destructive"
                              : "text-foreground";
                      return (
                        <TableRow
                          key={item.id}
                          onClick={() =>
                            navigate(withRecordType(`/merge/${item.id}`))
                          }
                          className="cursor-pointer"
                          style={{ animationDelay: `${i * 30}ms` }}
                        >
                          <TableCell>
                            <IdChip>#{item.id}</IdChip>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-[13px]">
                              {item.record_a_name || `#${item.record_a_id}`}{" "}
                              <span className="text-muted-foreground font-normal">
                                ↔
                              </span>{" "}
                              {item.record_b_name || `#${item.record_b_id}`}
                            </div>
                            <div className="flex gap-2.5 text-[11px] text-muted-foreground mt-0.5">
                              {item.record_a_source && (
                                <span className="inline-flex items-center gap-1">
                                  <SourcePill short={item.record_a_source} />
                                </span>
                              )}
                              {item.record_b_source && (
                                <span className="inline-flex items-center gap-1">
                                  <SourcePill short={item.record_b_source} />
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={`font-mono tabular-nums text-xs font-semibold ${toneClass}`}
                            >
                              {item.confidence.toFixed(3)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {item.reviewed_by ? (
                              <span className="font-mono text-[11px] text-primary">
                                {item.reviewed_by}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {relativeTime(item.reviewed_at ?? item.created_at)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(withRecordType(`/merge/${item.id}`));
                              }}
                              className="gap-1 px-2.5"
                            >
                              <MergeIcon className="size-3" />
                              Reconcile
                              <ArrowRightIcon className="size-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </LoadingErrorEmpty>
            </CardContent>

            {(queue?.total ?? 0) > PAGE_SIZE && (
              <CardFooter className="px-3.5 py-2 border-t bg-transparent">
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  totalItems={queue?.total ?? 0}
                  onPageChange={handlePageChange}
                />
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
