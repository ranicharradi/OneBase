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
