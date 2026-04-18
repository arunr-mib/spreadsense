export interface User {
  user_id: number
  full_name: string
  role: 'analyst' | 'sr_credit_analyst' | 'admin'
  access_token: string
}

export interface Borrower {
  id: number
  name: string
  tax_id?: string
  sic_code?: string
  fiscal_year_end_month: number
  industry?: string
  created_by: number
  created_at: string
}

export interface Spread {
  id: number
  borrower_id: number
  deal_name: string
  loan_type_id?: number
  status: 'draft' | 'completed' | 'reviewed' | 'exported'
  created_by: number
  assigned_reviewer?: number
  created_at: string
  updated_at: string
}

export interface SpreadPeriod {
  id: number
  spread_id: number
  fiscal_year: number
  period_type: 'actual' | 'projected'
  locked: boolean
}

export interface SpreadLineItem {
  id: number | null
  spread_period_id: number
  statement: 'IS' | 'BS' | 'CF'
  rma_field_key: string
  label: string
  value: number | null
  computed: boolean
  source: 'manual' | 'pdf' | 'xlsx' | 'docx' | null
  confidence_score: number | null
  updated_at: string | null
}

export interface Adjustment {
  id: number
  spread_line_item_id: number
  delta: number
  reason: string
  created_by: number
  created_at: string
}

export interface ExtractionJob {
  id: number
  spread_id: number
  filename: string
  file_type: string
  status: 'pending' | 'processing' | 'ready' | 'confirmed'
  results: Record<string, Record<string, { value: number | null; confidence_score: number }>> | null
  created_at: string
}
