import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getBorrowers } from '../api/borrowers'
import { getSpreads } from '../api/spreads'
import { useAuthStore } from '../store/auth'

function toMonthName(month: number): string {
  return new Date(2000, month - 1).toLocaleString('default', { month: 'long' })
}

export default function BorrowerListPage() {
  const user = useAuthStore((s) => s.user)
  const isSrOrAdmin = user?.role === 'sr_credit_analyst' || user?.role === 'admin'
  const spreadColLabel = isSrOrAdmin ? 'Spreads' : 'My Spreads'

  const { data: borrowers = [], isLoading: borrowersLoading } = useQuery({
    queryKey: ['borrowers'],
    queryFn: getBorrowers,
  })

  const { data: spreads = [], isLoading: spreadsLoading } = useQuery({
    queryKey: ['spreads'],
    queryFn: getSpreads,
  })

  const isLoading = borrowersLoading || spreadsLoading

  function spreadCount(borrowerId: number): number {
    return spreads.filter((s) => s.borrower_id === borrowerId).length
  }

  function lastSpreadDate(borrowerId: number): string {
    const dates = spreads
      .filter((s) => s.borrower_id === borrowerId)
      .map((s) => new Date(s.updated_at).getTime())
    if (dates.length === 0) return '—'
    const max = new Date(Math.max(...dates))
    return max.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-6">Borrowers</h1>

        {isLoading ? (
          <p className="text-[var(--text-secondary)] text-sm">Loading...</p>
        ) : borrowers.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-secondary)]">
            <p className="text-lg">No borrowers yet</p>
            <p className="text-sm mt-1">Borrowers are created when you start a new spread.</p>
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-page)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Industry</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">FY End</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">{spreadColLabel}</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Last Spread</th>
                </tr>
              </thead>
              <tbody>
                {borrowers.map((borrower) => (
                  <tr key={borrower.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-page)]">
                    <td className="px-4 py-3">
                      <Link
                        to={`/borrowers/${borrower.id}`}
                        className="text-[var(--accent)] hover:opacity-80 font-medium"
                      >
                        {borrower.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {borrower.industry ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {borrower.fiscal_year_end_month
                        ? toMonthName(borrower.fiscal_year_end_month)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">{spreadCount(borrower.id)}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{lastSpreadDate(borrower.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
