import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBorrower } from '../api/borrowers'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function BorrowerNewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [sicCode, setSicCode] = useState('')
  const [fyEndMonth, setFyEndMonth] = useState(12)

  const mutation = useMutation({
    mutationFn: createBorrower,
    onSuccess: (borrower) => {
      qc.invalidateQueries({ queryKey: ['borrowers'] })
      navigate(`/borrowers/${borrower.id}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    mutation.mutate({
      name: name.trim(),
      industry: industry.trim() || undefined,
      sic_code: sicCode.trim() || undefined,
      fiscal_year_end_month: fyEndMonth,
    })
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <div className="max-w-xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link to="/borrowers" className="text-[var(--accent)] hover:opacity-80 text-sm">
            ← Borrowers
          </Link>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mt-2">New Borrower</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6 space-y-5">

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Company Name <span className="text-[var(--accent)]">*</span>
              </label>
              <input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                autoFocus
                required
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-page)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label htmlFor="industry" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Industry
              </label>
              <input
                id="industry"
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                placeholder="e.g. Manufacturing"
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-page)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label htmlFor="sic-code" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                SIC Code
              </label>
              <input
                id="sic-code"
                value={sicCode}
                onChange={e => setSicCode(e.target.value)}
                placeholder="e.g. 3559"
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-page)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>

            <div>
              <label htmlFor="fy-end" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Fiscal Year End
              </label>
              <select
                id="fy-end"
                value={fyEndMonth}
                onChange={e => setFyEndMonth(Number(e.target.value))}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-page)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {MONTHS.map((month, i) => (
                  <option key={i + 1} value={i + 1}>{month}</option>
                ))}
              </select>
            </div>
          </div>

          {mutation.isError && (
            <p className="text-[var(--breach)] text-sm mt-3">Failed to create borrower. Please try again.</p>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Link
              to="/borrowers"
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={!name.trim() || mutation.isPending}
              className="px-5 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
            >
              {mutation.isPending ? 'Creating...' : 'Create Borrower'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
