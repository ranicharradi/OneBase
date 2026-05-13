// ── API Types matching backend schemas ──

export interface User {
  id: number;
  username: string;
  is_active: boolean;
  role: string;
  created_at: string;
}

export type RecordTypeRole = 'name' | 'code' | 'email' | 'phone' | 'enum' | 'extra';

export interface FieldDef {
  key: string;
  label: string;
  role: RecordTypeRole;
  required: boolean;
  synonyms?: string[];
}

export interface Signal {
  kind: string;
  field: string;
  weight: number;
}

export interface RecordType {
  key: string;
  label: string;
  fields: FieldDef[];
  signals: Signal[];
}

export interface RecordTypeSummary {
  key: string;
  label: string;
  field_count: number;
}

export interface RecordTypeListResponse {
  types: RecordTypeSummary[];
}

export type ColumnMapping = Record<string, string>;

export interface DataSource {
  id: number;
  name: string;
  type: string;
  description: string | null;
  file_format: string;
  delimiter: string;
  column_mapping: Record<string, unknown>;
  filename_pattern: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DataSourceCreate {
  name: string;
  type: string;
  description?: string | null;
  file_format?: string;
  delimiter?: string;
  column_mapping: ColumnMapping;
  filename_pattern?: string | null;
}

export interface DataSourceUpdate {
  name?: string;
  description?: string | null;
  delimiter?: string | null;
  column_mapping?: ColumnMapping;
  filename_pattern?: string | null;
}

export interface UserCreate {
  username: string;
  password: string;
}

// ── Upload / Ingestion types ──

export interface UploadResponse {
  batch_id: number;
  task_id: string;
  filename: string;
  message: string;
}

export interface BatchResponse {
  id: number;
  data_source_id: number;
  filename: string;
  uploaded_by: string;
  row_count: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
  task_id: string | null;
}

export interface TaskStatus {
  task_id: string;
  state: string;
  stage: string | null;
  progress: number | null;
  detail: string | null;
  row_count: number | null;
}

// ── Matching notification types (WebSocket) ──

export interface MatchingNotification {
  type: 'matching_complete' | 'matching_failed' | 'matching_progress';
  data: {
    batch_id: number;
    candidate_count?: number;
    group_count?: number;
    error?: string;
    stage?: string;
    progress?: number;
  };
  timestamp: string;
}

// ── Review & Merge types ──

export interface RecordDetail {
  id: number;
  type: string;
  name: string | null;
  normalized_name: string | null;
  fields: Record<string, unknown>;
  data_source_id: number;
  data_source_name: string | null;
  raw_data: Record<string, unknown> | null;
}

export interface FieldComparison {
  field: string;
  label: string;
  value_a: string | null;
  value_b: string | null;
  source_a: string | null;
  source_b: string | null;
  is_conflict: boolean;
  is_identical: boolean;
  is_a_only: boolean;
  is_b_only: boolean;
}

export interface MatchDetailResponse {
  id: number;
  type: string;
  confidence: number;
  match_signals: Record<string, number>;
  status: string;
  group_id: number | null;
  record_a: RecordDetail;
  record_b: RecordDetail;
  field_comparisons: FieldComparison[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

export interface ReviewQueueItem {
  id: number;
  type: string;
  record_a_id: number;
  record_b_id: number;
  record_a_name: string | null;
  record_b_name: string | null;
  record_a_source: string | null;
  record_b_source: string | null;
  record_a_fields: Record<string, unknown>;
  record_b_fields: Record<string, unknown>;
  confidence: number;
  match_signals: Record<string, number>;
  status: string;
  group_id: number | null;
  created_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  total: number;
  has_more: boolean;
}

export interface FieldSelection {
  field: string;
  chosen_record_id: number;
}

export interface ReviewActionResponse {
  candidate_id: number;
  action: string;
  unified_record_id: number | null;
}

export interface ReviewStats {
  total_pending: number;
  total_confirmed: number;
  total_merged: number;
  total_rejected: number;
  total_unified: number;
}

export interface FieldProvenance {
  value: string | null;
  source_entity: string | null;
  source_record_id: number | null;
  auto: boolean;
  chosen_by: string | null;
  chosen_at: string | null;
}

// ── Unified Browse types ──

export interface UnifiedRecordListItem {
  id: number;
  type: string;
  name: string;
  fields: Record<string, unknown>;
  source_count: number;
  is_singleton: boolean;
  created_by: string;
  created_at: string | null;
  dq_completeness?: number | null;
  dq_validity?: number | null;
  dq_score?: number | null;
}

export interface UnifiedRecordListResponse {
  items: UnifiedRecordListItem[];
  total: number;
  has_more: boolean;
}

export interface SourceRecord {
  id: number;
  type: string;
  name: string | null;
  fields: Record<string, unknown>;
  data_source_name: string | null;
  data_source_id: number;
}

export interface MergeHistoryEntry {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string | null;
}

export interface UnifiedRecordDetail {
  id: number;
  type: string;
  name: string;
  fields: Record<string, unknown>;
  provenance: Record<string, FieldProvenance>;
  source_record_ids: number[];
  source_records: SourceRecord[];
  match_candidate_id: number | null;
  merge_history: MergeHistoryEntry[];
  created_by: string;
  created_at: string | null;
  dq_completeness?: number | null;
  dq_validity?: number | null;
  dq_score?: number | null;
}

// ── Singleton types ──

export interface SingletonCandidate {
  id: number;
  type: string;
  name: string | null;
  fields: Record<string, unknown>;
  data_source_id: number;
  data_source_name: string | null;
}

export interface SingletonListResponse {
  items: SingletonCandidate[];
  total: number;
  has_more: boolean;
}

export interface PromoteResponse {
  unified_record_id: number;
  record_name: string;
  message: string;
}

export interface BulkPromoteRequest {
  record_ids: number[];
}

export interface BulkPromoteResponse {
  promoted_count: number;
  unified_record_ids: number[];
}

// ── Dashboard types ──

export interface UploadStats {
  total_batches: number;
  completed: number;
  failed: number;
  total_staged: number;
}

export interface MatchStats {
  total_candidates: number;
  total_groups: number;
  avg_confidence: number | null;
}

export interface ReviewProgress {
  pending: number;
  confirmed: number;
  rejected: number;
}

export interface UnifiedStatsData {
  total_unified: number;
  merged: number;
  singletons: number;
}

export interface RecentActivity {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
}

export interface DashboardResponse {
  uploads: UploadStats;
  matching: MatchStats;
  review: ReviewProgress;
  unified: UnifiedStatsData;
  recent_activity: RecentActivity[];
}

// ── Upload stats (re-upload dialog) ──

export interface UploadStatsResponse {
  staged_count: number;
  pending_match_count: number;
}

// ── ML Model status ──

export interface ModelStatusResponse {
  last_retrained: string | null;
  last_trained: string | null;
  review_count: number;
  current_weights: Record<string, number>;
  ml_model_exists: boolean;
}

// ── Standalone file checker types ──

export interface FileCheckIssue {
  id: number;
  report_id: number;
  row_number: number;
  column_name: string | null;
  issue_type: 'empty_row' | 'missing_value' | 'corrupted_value' | 'parse_error';
  severity: 'info' | 'warning' | 'error';
  value_preview: string | null;
  message: string;
  created_at: string | null;
}

export interface FileCheckReport {
  id: number;
  original_filename: string;
  file_size_bytes: number;
  delimiter: string;
  status: 'processing' | 'clean' | 'warning' | 'failed' | 'error';
  total_rows: number;
  rows_with_issues: number;
  empty_row_count: number;
  missing_value_count: number;
  corrupted_value_count: number;
  stored_issue_count: number;
  issue_cap_reached: boolean;
  criteria_version: string;
  error_message: string | null;
  checked_by: string;
  created_at: string | null;
  completed_at: string | null;
}

export interface FileCheckReportDetail extends FileCheckReport {
  issues: FileCheckIssue[];
  issue_total: number;
  issue_limit: number;
  issue_offset: number;
}

export interface FileCheckReportListResponse {
  items: FileCheckReport[];
  total: number;
}

export interface SuggestMappingRequest {
  record_type: string;
  headers: string[];
  sample_rows: Record<string, unknown>[];
}

export interface SuggestMappingResponse {
  suggestions: Record<string, string | null>;
  model: string;
  latency_ms: number;
}
