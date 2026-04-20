import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getSpreads } from '../api/spreads'
import StatusBadge from '../components/StatusBadge'
import NewSpreadModal from '../components/NewSpreadModal'

type StatusFilter = 'all' | 'draft' | 'completed' | 'reviewed' | 'exported'

const FILTER_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Awaiting Review' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'exported', label: 'Exported' },
]

export default function DealDashboardPage() {
  const [showModal, setShowModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const navigate = useNavigate()
  const { data: spreads = [], isLoading, isError } = useQuery({ queryKey: ['spreads'], queryFn: getSpreads })

  const filtered = statusFilter === 'all' ? spreads : spreads.filter((s) => s.status === statusFilter)

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Spreads {!isLoading && <span className="text-[var(--text-secondary)] font-normal text-base">({filtered.length})</span>}
          </h2>
          <button onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg hover:opacity-90 font-medium">
            + New Spread
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 mb-5 border-b border-[var(--border)]">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
                statusFilter === tab.value
                  ? 'border-[var(--accent)] text-[var(--accent)] font-medium'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
              {tab.value !== 'all' && !isLoading && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({spreads.filter((s) => s.status === tab.value).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {isError && (
          <p className="text-[var(--breach)] text-sm">Failed to load spreads. Please refresh the page.</p>
        )}
        {isLoading ? (
          <p className="text-[var(--text-secondary)] text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-secondary)]">
            <p className="text-lg">{spreads.length === 0 ? 'No spreads yet' : 'No spreads match this filter'}</p>
            {spreads.length === 0 && <p className="text-sm mt-1">Click &quot;+ New Spread&quot; to get started</p>}
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-page)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Deal Name</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((s) => (
                  <tr key={s.id} onClick={() => navigate(`/spreads/${s.id}`)} className="border-b border-[var(--border)] hover:bg-[var(--bg-page)] cursor-pointer">
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{s.deal_name}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{new Date(s.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showModal && <NewSpreadModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
