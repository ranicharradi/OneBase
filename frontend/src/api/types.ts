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
