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
