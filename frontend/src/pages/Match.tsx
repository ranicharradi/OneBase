import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeftIcon, BadgeCheckIcon } from "lucide-react";
import { api } from "../api/client";
import { useMatchRunStatus } from "../hooks/useMatchRun";
import { useSelectedRecordType } from "../contexts/RecordTypeContext";
import type {
  DataSource,
  MatchMode,
  MatchRunCreate,
  MatchRunDispatchResponse,
  MatchRunResponse,
  MatchRunStatus,
} from "../api/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "../components/ui/card";
import Spinner from "../components/ui/Spinner";
import { Badge } from "../components/ui/badge";
import Hbar from "../components/ui/Hbar";
import { Button } from "../components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "../components/ui/table";
import { MODE_LABEL } from "../utils/matchRuns";
import { relativeTime } from "../utils/time";
import WorkflowStageRail from "../components/WorkflowStageRail";
import HandoffBanner from "../components/HandoffBanner";

// ── Constants ─────────────────────────────────────────

const COMP_STAGES = [
  { key: "BLOCKING", label: "Blocking" },
  { key: "SCORING", label: "Scoring" },
  { key: "CLUSTERING", label: "Clustering" },
  { key: "INSERTING", label: "Writing" },
];

// ── Active run pipeline card ───────────────────────────

function MatchingPipeline({ status }: { status?: MatchRunStatus }) {
  const N = COMP_STAGES.length;
  const isComplete =
    status?.state === "COMPLETE" || status?.state === "SUCCESS";
  const isFailed = status?.state === "FAILURE";
  const activeIdx = status?.stage
    ? COMP_STAGES.findIndex((s) => s.key === status.stage)
    : -1;
  const queued = !status || (status.state === "PENDING" && !status.stage);
  const pct = isComplete ? 100 : (status?.progress ?? 0);

  const sidePct = (1 / (2 * N)) * 100;
  const progressPct = isComplete
    ? 100 - 2 * sidePct
    : (Math.max(0, activeIdx) / Math.max(1, N - 1)) * (100 - 2 * sidePct);

  return (
    <div className="px-4 pb-3.5 pt-3 border-t border-border">
      <div className="flex items-center gap-2.5 mb-3.5">
        <Hbar
          value={pct}
          className="h-[3px] flex-1"
          fillClassName={
            isComplete
              ? "bg-emerald-500"
              : isFailed
                ? "bg-destructive"
                : "bg-primary"
          }
        />
        <span
          className={`font-mono tabular-nums text-[11px] font-semibold w-9 text-right ${
            isComplete
              ? "text-emerald-600"
              : isFailed
                ? "text-destructive"
                : "text-primary"
          }`}
        >
          {Math.round(pct)}%
        </span>
      </div>

      <div className="relative">
        <div
          className="absolute top-2.5 h-[1.5px] bg-border z-0"
          style={{ left: `${sidePct}%`, right: `${sidePct}%` }}
        />
        <div
          className="absolute top-2.5 h-[1.5px] z-[1] transition-[width] duration-500 ease-out"
          style={{
            left: `${sidePct}%`,
            width: `${progressPct}%`,
            background: isFailed ? "hsl(var(--destructive))" : "hsl(var(--primary))",
          }}
        />

        <div className="relative z-[2] flex">
          {COMP_STAGES.map((stage, i) => {
            const done = isComplete || (activeIdx >= 0 && i < activeIdx);
            const active = !isComplete && !isFailed && i === activeIdx;
            const failed = isFailed && i === activeIdx;

            return (
              <div
                key={stage.key}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-[background,border-color] duration-300 ${
                    done
                      ? "bg-primary border-primary"
                      : active
                        ? "bg-primary/10 border-primary"
                        : failed
                          ? "bg-destructive/10 border-destructive"
                          : "bg-secondary border-border"
                  }`}
                >
                  {done ? (
                    <span className="text-[8px] text-primary-foreground font-bold">
                      ✓
                    </span>
                  ) : active ? (
                    <Spinner size={8} />
                  ) : failed ? (
                    <span className="text-[8px] text-destructive font-bold">
                      ✕
                    </span>
                  ) : null}
                </div>
                <span
                  className={`text-[9px] text-center ${done || active ? "text-foreground/80" : "text-muted-foreground"}`}
                >
                  {stage.label}
                </span>
                <span
                  className={`font-mono tabular-nums text-[9px] text-center min-h-[12px] ${
                    done
                      ? "text-muted-foreground"
                      : active
                        ? "text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  {done ? "done" : active ? `${Math.round(pct)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {queued ? (
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Spinner size={8} />
          queued, waiting for worker…
        </div>
      ) : status?.detail ? (
        <div className="mt-2.5 px-2 py-1 bg-muted rounded-[3px] text-[10px] text-muted-foreground font-mono">
          {status.detail}
        </div>
      ) : null}
    </div>
  );
}

function ActiveRunCard({
  run,
  onReview,
}: {
  run: MatchRunResponse;
  onReview: (id: number) => void;
}) {
  const { data: liveStatus } = useMatchRunStatus(run.id);
  const isComplete =
    liveStatus?.state === "COMPLETE" || liveStatus?.state === "SUCCESS";

  return (
    <div className="mb-2.5 bg-card border border-border rounded-md overflow-hidden">
      <div className="px-3.5 py-2.5 bg-primary/5 flex items-center gap-2 flex-wrap">
        <ArrowRightLeftIcon className="size-3.5 text-primary shrink-0" />
        <span className="font-mono text-xs font-medium">
          Run <span className="text-primary">#{run.id}</span>
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {run.type}
        </span>
        <span className="text-[11px] text-muted-foreground">{run.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {relativeTime(run.created_at)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isComplete && (
            <Button size="sm" onClick={() => onReview(run.id)}>
              Review results →
            </Button>
          )}
          <Badge
            variant="secondary"
            className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 text-[10px]"
          >
            {run.status}
          </Badge>
        </div>
      </div>
      <MatchingPipeline status={liveStatus} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────

export default function Match() {
  const navigate = useNavigate();
  const { selectedType, withRecordType } = useSelectedRecordType();
  const [selState, setSelState] = useState<{
    type: string;
    ids: Set<number>;
    vsGolden: boolean;
  }>({
    type: selectedType,
    ids: new Set(),
    vsGolden: false,
  });

  const selected = useMemo(
    () => (selState.type === selectedType ? selState.ids : new Set<number>()),
    [selState.type, selState.ids, selectedType],
  );
  const vsGolden = selState.type === selectedType ? selState.vsGolden : false;

  const { data: sources } = useQuery({
    queryKey: ["sources", "with-stats", selectedType],
    queryFn: () =>
      api.get<DataSource[]>(
        `/api/sources?type=${selectedType}&with_stats=true`,
      ),
  });

  const { data: allRuns } = useQuery({
    queryKey: ["match-runs"],
    queryFn: () => api.get<MatchRunResponse[]>("/api/matches"),
    refetchInterval: (q) => {
      const data = q.state.data as MatchRunResponse[] | undefined;
      return data?.some((r) => r.status === "pending" || r.status === "running")
        ? 3000
        : false;
    },
  });

  const activeRuns = (allRuns ?? []).filter(
    (r) => r.status === "pending" || r.status === "running",
  );

  const typeSources = useMemo(() => sources ?? [], [sources]);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const effectiveSelection = vsGolden ? selectedIds.slice(0, 1) : selectedIds;
  const dispatchMode: MatchMode = vsGolden ? "FILE_VS_GOLDEN" : "FILE_VS_FILE";
  const minFiles = vsGolden ? 1 : 2;

  const goldenCountQuery = useQuery({
    queryKey: ["golden-count", selectedType],
    queryFn: () => api.get<{ count: number }>(`/api/unified/count?type=${selectedType}`),
  });
  const goldenCount = goldenCountQuery.data?.count ?? 0;
  const noGoldenForSingle = effectiveSelection.length === 1 && goldenCount === 0;

  const isValid = effectiveSelection.length >= minFiles && !noGoldenForSingle;

  const pairwiseRunCount =
    effectiveSelection.length >= 2
      ? (effectiveSelection.length * (effectiveSelection.length - 1)) / 2
      : 0;

  const selectedSources = useMemo(
    () => typeSources.filter((s) => effectiveSelection.includes(s.id)),
    [typeSources, effectiveSelection],
  );

  const launch = useMutation({
    mutationFn: async () => {
      const payload: MatchRunCreate = {
        type: selectedType,
        source_ids: effectiveSelection,
      };
      return api.post<MatchRunDispatchResponse>("/api/matches", payload);
    },
    onSuccess: (dispatch) => {
      const runs = dispatch.runs ?? [];
      if (runs.length === 1) {
        navigate(withRecordType(`/review?match_run_id=${runs[0].id}`));
      } else {
        navigate(withRecordType("/match"));
      }
    },
  });

  const toggleRow = (id: number) => {
    setSelState((prev) => {
      const ids =
        prev.type === selectedType ? new Set(prev.ids) : new Set<number>();
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { ...prev, type: selectedType, ids };
    });
  };

  const needMore = minFiles - effectiveSelection.length;

  // ── Panel header buttons (shared between empty/non-empty states) ──────────
  const panelHeaderButtons = (
    <div className="flex items-center gap-2">
      {effectiveSelection.length > 0 && !vsGolden && (
        <span className="font-mono text-[11px] text-primary">
          {MODE_LABEL[dispatchMode]}
        </span>
      )}
      <Button
        variant={vsGolden ? "default" : "outline"}
        size="sm"
        onClick={() =>
          setSelState({
            type: selectedType,
            ids: new Set(),
            vsGolden: !vsGolden,
          })
        }
        title="Match selected source against the unified golden set"
      >
        vs Golden
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link to="/history">History ▸</Link>
      </Button>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5">
        <WorkflowStageRail
          activeStage="match"
          match={{
            count: {
              value:
                activeRuns.length > 0
                  ? activeRuns.length
                  : (allRuns?.length ?? "—"),
              unit: activeRuns.length > 0 ? "running" : "runs",
            },
          }}
          review={{
            onClick: () => navigate(withRecordType("/review")),
            title: "Go to Review queue",
          }}
          merge={{
            onClick: () => navigate(withRecordType("/merge")),
            title: "Go to Merge queue",
          }}
          unified={{
            onClick: () => navigate(withRecordType("/unified")),
            title: "Go to Unified records",
          }}
        />

        <HandoffBanner
          icon="compare_arrows"
          text={
            <>
              completed runs deliver matched pairs to the{" "}
              <span className="text-primary font-semibold">
                Review queue
              </span>{" "}
              for human triage.
            </>
          }
          note="auto-routed · no review on this screen"
        />

        {/* Active run cards */}
        {activeRuns.map((r) => (
          <ActiveRunCard
            key={r.id}
            run={r}
            onReview={(id) =>
              navigate(withRecordType(`/review?match_run_id=${id}`))
            }
          />
        ))}

        {/* vs Golden mode banner */}
        {vsGolden && (
          <div className="flex items-center gap-2.5 px-3.5 py-2 mb-3 bg-primary/8 border border-primary/30 rounded-md">
            <BadgeCheckIcon className="size-3.5 text-primary shrink-0" />
            <span className="font-mono text-[11px] font-semibold text-primary tracking-wide">
              SOURCE × GOLDEN
            </span>
            <span className="text-[11px] text-muted-foreground">—</span>
            <span className="text-[11px] text-muted-foreground">
              select one source to match against the unified golden set
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto"
              onClick={() =>
                setSelState((s) => ({ ...s, ids: new Set(), vsGolden: false }))
              }
            >
              cancel
            </Button>
          </div>
        )}

        {/* Sources panel */}
        {typeSources.length === 0 ? (
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Sources</CardTitle>
              <CardAction>{panelHeaderButtons}</CardAction>
            </CardHeader>
            <CardContent className="py-7 text-center text-muted-foreground text-xs">
              No sources yet
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Sources</CardTitle>
              <CardAction>{panelHeaderButtons}</CardAction>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-9" />
                    <TableHead>Source</TableHead>
                    <TableHead>Last uploaded</TableHead>
                    <TableHead className="text-right">Active rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typeSources.map((src) => {
                    const inEffective = effectiveSelection.includes(src.id);
                    const isChecked = selected.has(src.id);
                    const overCap = vsGolden && !inEffective && isChecked;
                    const dimmed =
                      vsGolden &&
                      !inEffective &&
                      !isChecked &&
                      effectiveSelection.length >= 1;
                    return (
                      <TableRow
                        key={src.id}
                        onClick={() => toggleRow(src.id)}
                        data-state={inEffective ? "selected" : undefined}
                        className="cursor-pointer"
                        style={{ opacity: overCap || dimmed ? 0.35 : 1 }}
                      >
                        <TableCell>
                          <input type="checkbox" checked={isChecked} readOnly />
                        </TableCell>
                        <TableCell>
                          <span
                            className="font-mono text-xs"
                            title={src.description ?? src.name}
                          >
                            {src.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          {src.last_uploaded_at ? (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {relativeTime(src.last_uploaded_at)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {(src.active_row_count ?? 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Sticky footer */}
        <div className="sticky bottom-0 mt-4 bg-background border-t border-border px-3.5 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {effectiveSelection.length === 0 ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {vsGolden
                  ? "select 1 source to match against the golden set"
                  : "select 2+ sources to compare"}
              </span>
            ) : (
              selectedSources.map((src) => (
                <Badge
                  key={src.id}
                  variant="secondary"
                  className="text-[10px] gap-1 shrink-0"
                >
                  <span className="font-mono opacity-60 text-[9px]">▤</span>
                  {src.name.length > 20
                    ? src.name.slice(0, 20) + "…"
                    : src.name}
                </Badge>
              ))
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {noGoldenForSingle && (
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[10px]"
              >
                No golden records yet — select at least 2 sources
              </Badge>
            )}
            {!isValid && !noGoldenForSingle && effectiveSelection.length > 0 && (
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[10px]"
              >
                need {needMore} more
              </Badge>
            )}
            {pairwiseRunCount > 1 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                Will dispatch {pairwiseRunCount} runs
              </span>
            )}
            <Button
              size="sm"
              disabled={!isValid || launch.isPending}
              onClick={() => launch.mutate()}
            >
              {launch.isPending ? <Spinner size={10} /> : null}
              Match ▸
            </Button>
          </div>
        </div>

        {launch.isError && (
          <Badge
            variant="destructive"
            className="mt-3 text-xs"
          >
            {(launch.error as Error).message}
          </Badge>
        )}
      </div>
    </div>
  );
}
