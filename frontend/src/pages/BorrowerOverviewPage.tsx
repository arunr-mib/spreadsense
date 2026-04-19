import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getBorrowerById } from '../api/borrowers'
import { getSpreadsByBorrowerId } from '../api/spreads'
import StatusBadge from '../components/StatusBadge'

function toMonthName(month: number): string {
  return new Date(2000, month - 1).toLocaleString('default', { month: 'long' })
}

export default function BorrowerOverviewPage() {
  const { id } = useParams<{ id: string }>()
  const borrowerId = Number(id)

  const { data: borrower, isLoading: borrowerLoading } = useQuery({
    queryKey: ['borrower', borrowerId],
    queryFn: () => getBorrowerById(borrowerId),
    enabled: !!borrowerId,
  })

  const { data: spreads = [], isLoading: spreadsLoading } = useQuery({
    queryKey: ['spreads-by-borrower', borrowerId],
    queryFn: () => getSpreadsByBorrowerId(borrowerId),
    enabled: !!borrowerId,
  })

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link to="/borrowers" className="text-[var(--accent)] hover:opacity-80 text-sm">
            ← Borrowers
          </Link>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] mt-2">
            {borrowerLoading ? (
              <span className="inline-block w-48 h-6 bg-[var(--border)] rounded animate-pulse" />
            ) : (
              borrower?.name ?? 'Borrower'
            )}
          </h1>
        </div>

        {/* Metadata cards */}
        {!borrowerLoading && borrower && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetaCard label="Industry" value={borrower.industry ?? '—'} />
            <MetaCard label="SIC Code" value={borrower.sic_code ? String(borrower.sic_code) : '—'} />
            <MetaCard
              label="FY End"
              value={borrower.fiscal_year_end_month ? toMonthName(borrower.fiscal_year_end_month) : '—'}
            />
            <MetaCard label="Total Spreads" value={String(spreads.length)} />
          </div>
        )}

        {/* Spreads table */}
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">Spreads</h2>
        {spreadsLoading ? (
          <p className="text-[var(--text-secondary)] text-sm">Loading spreads...</p>
        ) : spreads.length === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">No spreads for this borrower.</p>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-page)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Deal Name</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Updated</th>
                </tr>
              </thead>
              <tbody>
                {spreads.map((spread) => (
                  <tr key={spread.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-page)]">
                    <td className="px-4 py-3">
                      <Link
                        to={`/spreads/${spread.id}`}
                        className="text-[var(--accent)] hover:opacity-80 font-medium"
                      >
                        {spread.deal_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={spread.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {new Date(spread.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
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

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-[var(--text-secondary)] mb-1">{label}</div>
      <div className="text-sm font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}
