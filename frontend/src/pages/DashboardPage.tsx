import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getPortfolioSummary } from '../api/portfolio'
import StatusBadge from '../components/StatusBadge'
import type { SpreadSummary, BreachAlert } from '../types'

type FilterTab = 'all' | 'awaiting' | 'breaches'

const RATIO_LABELS: Record<string, string> = {
  dscr: 'DSCR',
  leverage: 'Leverage',
  current_ratio: 'Current Ratio',
  interest_coverage: 'Int. Coverage',
}

function filterSummaries(summaries: SpreadSummary[], tab: FilterTab): SpreadSummary[] {
  if (tab === 'awaiting') return summaries.filter(s => s.status === 'completed')
  if (tab === 'breaches') return summaries.filter(s => s.alert_count > 0)
  return summaries
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const { data, isLoading, isError } = useQuery({
    queryKey: ['portfolio-summary'],
    queryFn: getPortfolioSummary,
  })

  if (isLoading) return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
      <span className="text-sm text-[var(--text-secondary)]">Loading portfolio...</span>
    </div>
  )

  if (isError || !data) return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
      <span className="text-sm text-[var(--breach)]">Could not load portfolio summary.</span>
    </div>
  )

  const { status_counts, breach_alerts, spread_summaries } = data
  const filteredSpreads = filterSummaries(spread_summaries, activeTab)
  const breachCount = breach_alerts.filter(a => a.severity === 'breach').length

  return (
    <div className="min-h-screen bg-[var(--bg-page)] p-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 no-print">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Portfolio Overview</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">All deals · sr credit analyst view</p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-[var(--accent)] text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Export PDF
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Total Deals</div>
          <div className="text-3xl font-bold text-[var(--text-primary)]">{status_counts.total}</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Awaiting Review</div>
          <div className="text-3xl font-bold text-[var(--accent)]">{status_counts.completed}</div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">needs sign-off</div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Ratio Breaches</div>
          <div className="text-3xl font-bold text-[var(--breach)]">{breachCount}</div>
          <div className="text-xs text-[var(--text-secondary)] mt-1">
            across {new Set(breach_alerts.filter(a => a.severity === 'breach').map(a => a.spread_id)).size} deals
          </div>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wide mb-1">Exported</div>
          <div className="text-3xl font-bold text-[var(--text-primary)]">{status_counts.exported}</div>
        </div>
      </div>

      {/* Middle row: Pipeline + Breach Alerts */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {/* Pipeline bar chart */}
        <div className="col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-4">Pipeline by Status</div>
          {status_counts.total === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">No deals yet.</p>
          ) : (
            <div className="space-y-3">
              {([
                ['Draft', status_counts.draft, 'bg-[var(--text-secondary)]'],
                ['Awaiting', status_counts.completed, 'bg-[var(--accent)]'],
                ['Reviewed', status_counts.reviewed, 'bg-green-600'],
                ['Exported', status_counts.exported, 'bg-blue-500'],
              ] as [string, number, string][]).map(([label, count, color]) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-right text-[var(--text-secondary)]">{label}</div>
                  <div className="flex-1 bg-[var(--bg-page)] rounded h-4">
                    <div
                      className={`${color} rounded h-4 transition-all`}
                      style={{ width: `${(count / status_counts.total) * 100}%` }}
                    />
                  </div>
                  <div className="w-6 text-xs font-semibold text-[var(--text-primary)]">{count}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Breach & Near-Threshold Alerts */}
        <div className="col-span-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-4">
            Breach &amp; Near-Threshold Alerts
          </div>
          {breach_alerts.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">No alerts — all ratios within thresholds.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-1.5 px-2 text-[var(--text-secondary)] font-semibold">Deal</th>
                  <th className="text-left py-1.5 px-2 text-[var(--text-secondary)] font-semibold">Ratio</th>
                  <th className="text-left py-1.5 px-2 text-[var(--text-secondary)] font-semibold">Value</th>
                  <th className="text-left py-1.5 px-2 text-[var(--text-secondary)] font-semibold">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {breach_alerts.map((alert: BreachAlert, i: number) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-1.5 px-2 font-semibold text-[var(--text-primary)]">{alert.deal_name}</td>
                    <td className={`py-1.5 px-2 ${alert.severity === 'breach' ? 'text-[var(--breach)]' : 'text-yellow-600'}`}>
                      {RATIO_LABELS[alert.ratio_name] ?? alert.ratio_name} {alert.severity === 'breach' ? '⛔' : '⚠'}
                    </td>
                    <td className={`py-1.5 px-2 font-semibold ${alert.severity === 'breach' ? 'text-[var(--breach)]' : 'text-yellow-600'}`}>
                      {alert.value != null ? alert.value.toFixed(2) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-[var(--text-secondary)]">
                      {alert.direction} {alert.threshold.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Spreads table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
            All Deals ({filteredSpreads.length})
          </div>
          <div className="flex gap-2 no-print">
            {([
              ['all', 'All'],
              ['awaiting', 'Awaiting Review'],
              ['breaches', 'Breaches Only'],
            ] as [FilterTab, string][]).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs px-3 py-1 rounded ${
                  activeTab === tab
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-page)] text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filteredSpreads.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] py-4 text-center">No deals match this filter.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Deal Name</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Borrower</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Status</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Analyst</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Alerts</th>
                <th className="text-left py-2 px-2 text-[var(--text-secondary)] font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredSpreads.map((s: SpreadSummary) => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-page)] cursor-pointer">
                  <td className="py-2 px-2">
                    <Link to={`/spreads/${s.id}`} className="font-semibold text-[var(--accent)] hover:underline">
                      {s.deal_name}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-[var(--text-primary)]">{s.borrower_name}</td>
                  <td className="py-2 px-2"><StatusBadge status={s.status} /></td>
                  <td className="py-2 px-2 text-[var(--text-secondary)]">{s.analyst_name}</td>
                  <td className="py-2 px-2">
                    {s.alert_count > 0
                      ? <span className="text-[var(--breach)] font-semibold">{s.alert_count} alert{s.alert_count > 1 ? 's' : ''}</span>
                      : <span className="text-[var(--text-secondary)]">—</span>
                    }
                  </td>
                  <td className="py-2 px-2 text-[var(--text-secondary)]">
                    {new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
