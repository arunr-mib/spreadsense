import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMemoMeta, saveMemoMeta, exportMemoAsPdf } from '../api/memo'
import type { CreditMemoMeta } from '../types'

interface Props {
  spreadId: number
}

const EMPTY_META: CreditMemoMeta = {
  recommendation: null,
  risk_rating: null,
  facility_type: null,
  facility_amount: null,
  facility_purpose: null,
  facility_maturity: null,
  collateral: null,
}

export default function MemoSection({ spreadId }: Props) {
  const qc = useQueryClient()
  const [isDirty, setIsDirty] = useState(false)
  const [form, setForm] = useState<CreditMemoMeta>(EMPTY_META)
  const [formInitialized, setFormInitialized] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data: savedMeta, isLoading } = useQuery({
    queryKey: ['memo-meta', spreadId],
    queryFn: () => getMemoMeta(spreadId),
    staleTime: 30_000,
  })

  // Sync loaded data into form (once on first load only — prevents overwriting user edits)
  useEffect(() => {
    if (savedMeta !== undefined && !formInitialized) {
      setForm({ ...EMPTY_META, ...(savedMeta as CreditMemoMeta) })
      setFormInitialized(true)
    }
  }, [savedMeta, formInitialized])

  const saveMutation = useMutation({
    mutationFn: () => saveMemoMeta(spreadId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memo-meta', spreadId] })
      setIsDirty(false)
    },
  })

  function handleChange(key: keyof CreditMemoMeta, value: string | number | null) {
    setForm(prev => ({ ...prev, [key]: value === '' ? null : value }))
    setIsDirty(true)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const buffer = await exportMemoAsPdf(spreadId)
      const blob = new Blob([buffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `credit_memo_${spreadId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="py-12 text-center text-[var(--text-secondary)]">Loading...</div>
    )
  }

  const labelCls = 'block text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1'
  const inputCls = 'w-full text-sm border border-[var(--border)] rounded-md px-3 py-2 bg-[var(--bg-page)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Credit Memo Details</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Complete these fields to populate the exported credit memorandum.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !isDirty}
            className="px-3 py-1.5 text-sm rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-page)] disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : '💾 Save'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-1.5 text-sm rounded-lg bg-[var(--accent)] text-[var(--bg-page)] font-medium hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? '⏳ Exporting...' : '↓ Export PDF'}
          </button>
        </div>
      </div>

      {isDirty && (
        <p className="text-xs text-[var(--near)]">
          ● Unsaved changes — save before exporting to include latest details.
        </p>
      )}

      {/* Form */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">

          {/* Recommendation */}
          <div>
            <label className={labelCls}>Recommendation</label>
            <select
              value={form.recommendation ?? ''}
              onChange={e => handleChange('recommendation', e.target.value || null)}
              className={inputCls}
            >
              <option value="">— Select —</option>
              <option value="approve">Approve</option>
              <option value="approve_with_conditions">Approve with Conditions</option>
              <option value="decline">Decline</option>
            </select>
          </div>

          {/* Risk Rating */}
          <div>
            <label className={labelCls}>Risk Rating</label>
            <select
              value={form.risk_rating ?? ''}
              onChange={e => handleChange('risk_rating', e.target.value || null)}
              className={inputCls}
            >
              <option value="">— Select —</option>
              <option value="pass">Pass</option>
              <option value="watch">Watch</option>
              <option value="special_mention">Special Mention</option>
              <option value="substandard">Substandard</option>
              <option value="doubtful">Doubtful</option>
            </select>
          </div>

          {/* Facility Type */}
          <div>
            <label className={labelCls}>Facility Type</label>
            <select
              value={form.facility_type ?? ''}
              onChange={e => handleChange('facility_type', e.target.value || null)}
              className={inputCls}
            >
              <option value="">— Select —</option>
              <option value="term_loan">Term Loan</option>
              <option value="revolving_credit">Revolving Credit Facility</option>
              <option value="line_of_credit">Line of Credit</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Facility Amount */}
          <div>
            <label className={labelCls}>Facility Amount (USD)</label>
            <input
              type="number"
              value={form.facility_amount ?? ''}
              onChange={e => handleChange('facility_amount', e.target.value ? Number(e.target.value) : null)}
              placeholder="e.g. 2500000"
              className={inputCls}
            />
          </div>

          {/* Maturity */}
          <div>
            <label className={labelCls}>Maturity / Term</label>
            <input
              type="text"
              value={form.facility_maturity ?? ''}
              onChange={e => handleChange('facility_maturity', e.target.value || null)}
              placeholder="e.g. 5 years, 36 months"
              className={inputCls}
            />
          </div>

          {/* Purpose — full width */}
          <div className="md:col-span-2">
            <label className={labelCls}>Purpose / Use of Proceeds</label>
            <textarea
              value={form.facility_purpose ?? ''}
              onChange={e => handleChange('facility_purpose', e.target.value || null)}
              rows={2}
              placeholder="Describe the purpose and use of proceeds..."
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Collateral — full width */}
          <div className="md:col-span-2">
            <label className={labelCls}>Collateral</label>
            <textarea
              value={form.collateral ?? ''}
              onChange={e => handleChange('collateral', e.target.value || null)}
              rows={2}
              placeholder="Describe collateral and security position..."
              className={`${inputCls} resize-none`}
            />
          </div>

        </div>
      </div>

      <p className="text-xs text-[var(--text-secondary)]">
        Fields left blank appear as <em>[Information not provided]</em> in the PDF.
        The memo also includes your spread data, computed ratios, and the latest narrative.
      </p>
    </div>
  )
}
