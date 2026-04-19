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

export interface RatioSet {
  dscr: number | null
  leverage: number | null
  current_ratio: number | null
  interest_coverage: number | null
  ebitda_margin: number | null
  gross_margin: number | null
  net_profit_margin: number | null
  return_on_assets: number | null
}

export interface PeriodAnalytics {
  period_id: number
  fiscal_year: number
  period_type: 'actual' | 'projected'
  ratios: RatioSet
  breaches: string[]
  near_threshold: string[]
}

export interface SpreadAnalytics {
  spread_id: number
  periods: PeriodAnalytics[]
}

export interface NarrativeVersion {
  id: number
  spread_id: number
  version: number
  content: string
  created_by: number
  created_by_name: string
  created_at: string
}

export interface CreditMemoMeta {
  id?: number
  spread_id?: number
  recommendation: string | null
  risk_rating: string | null
  facility_type: string | null
  facility_amount: number | null
  facility_purpose: string | null
  facility_maturity: string | null
  collateral: string | null
  updated_at?: string
}

export interface StatusCounts {
  draft: number
  completed: number
  reviewed: number
  exported: number
  total: number
}

export interface BreachAlert {
  spread_id: number
  deal_name: string
  borrower_name: string
  ratio_name: string
  value: number | null
  threshold: number
  direction: 'min' | 'max'
  severity: 'breach' | 'near_threshold'
}

export interface SpreadSummary {
  id: number
  deal_name: string
  borrower_name: string
  status: string
  analyst_name: string
  alert_count: number
  updated_at: string
}

export interface PortfolioSummary {
  status_counts: StatusCounts
  breach_alerts: BreachAlert[]
  spread_summaries: SpreadSummary[]
}
