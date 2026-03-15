// ── API Types matching backend schemas ──

export interface User {
  id: number;
  username: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface ColumnMapping {
  supplier_name: string;
  supplier_code: string;
  short_name?: string;
  currency?: string;
  payment_terms?: string;
  contact_name?: string;
  supplier_type?: string;
}

export interface DataSource {
  id: number;
  name: string;
  description: string | null;
  file_format: string;
  delimiter: string;
  column_mapping: ColumnMapping;
  created_at: string;
  updated_at: string;
}

export interface DataSourceCreate {
  name: string;
  description?: string;
  file_format?: string;
  delimiter?: string;
  column_mapping: ColumnMapping;
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

export interface ColumnDetectResponse {
  columns: string[];
}

// ── Matching notification types (WebSocket) ──

export interface MatchingNotification {
  type: 'matching_complete' | 'matching_failed';
  data: {
    batch_id: number;
    candidate_count?: number;
    group_count?: number;
    error?: string;
  };
  timestamp: string;
}

// ── Review & Merge types ──

export interface SupplierDetail {
  id: number;
  source_code: string | null;
  name: string | null;
  short_name: string | null;
  currency: string | null;
  payment_terms: string | null;
  contact_name: string | null;
  supplier_type: string | null;
  normalized_name: string | null;
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
  confidence: number;
  match_signals: Record<string, number>;
  status: string;
  group_id: number | null;
  supplier_a: SupplierDetail;
  supplier_b: SupplierDetail;
  field_comparisons: FieldComparison[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

export interface ReviewQueueItem {
  id: number;
  supplier_a_id: number;
  supplier_b_id: number;
  supplier_a_name: string | null;
  supplier_b_name: string | null;
  supplier_a_source: string | null;
  supplier_b_source: string | null;
  confidence: number;
  status: string;
  group_id: number | null;
  created_at: string | null;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  total: number;
  has_more: boolean;
}

export interface FieldSelection {
  field: string;
  chosen_supplier_id: number;
}

export interface MergeRequest {
  field_selections: FieldSelection[];
}

export interface ReviewActionResponse {
  candidate_id: number;
  action: string;
  unified_supplier_id: number | null;
}

export interface ReviewStats {
  total_pending: number;
  total_confirmed: number;
  total_rejected: number;
  total_skipped: number;
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

export interface UnifiedSupplierResponse {
  id: number;
  name: string;
  source_code: string | null;
  short_name: string | null;
  currency: string | null;
  payment_terms: string | null;
  contact_name: string | null;
  supplier_type: string | null;
  provenance: Record<string, FieldProvenance>;
  source_supplier_ids: number[];
  match_candidate_id: number | null;
  created_by: string;
  created_at: string | null;
}
