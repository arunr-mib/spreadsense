import { useQuery } from '@tanstack/react-query'
import { getAnalytics } from '../api/analytics'
import type { PeriodAnalytics } from '../types'

interface Props {
  spreadId: number
}

interface ThresholdRatio {
  key: keyof PeriodAnalytics['ratios']
  label: string
  threshold: string
}

const THRESHOLD_RATIOS: ThresholdRatio[] = [
  { key: 'dscr', label: 'DSCR', threshold: '≥ 1.20x' },
  { key: 'leverage', label: 'Leverage (Debt/EBITDA)', threshold: '≤ 4.50x' },
  { key: 'current_ratio', label: 'Current Ratio', threshold: '≥ 1.50x' },
  { key: 'interest_coverage', label: 'Interest Coverage', threshold: '≥ 2.00x' },
]

// Pre-computed maps for O(1) lookups in the table
const THRESHOLD_MAP = new Map(THRESHOLD_RATIOS.map(r => [r.key, r.threshold]))
const RATIO_LABEL_MAP = new Map<string, string>([
  ['ebitda_margin', 'EBITDA Margin'],
  ['gross_margin', 'Gross Margin'],
  ['net_profit_margin', 'Net Profit Margin'],
])

const ALL_RATIOS: { key: keyof PeriodAnalytics['ratios']; label: string }[] = [
  { key: 'dscr', label: 'DSCR' },
  { key: 'leverage', label: 'Leverage (Debt/EBITDA)' },
  { key: 'current_ratio', label: 'Current Ratio' },
  { key: 'interest_coverage', label: 'Interest Coverage' },
  { key: 'ebitda_margin', label: 'EBITDA Margin' },
  { key: 'gross_margin', label: 'Gross Margin' },
  { key: 'net_profit_margin', label: 'Net Profit Margin' },
  { key: 'return_on_assets', label: 'Return on Assets' },
]

const THRESHOLD_KEYS = new Set(['dscr', 'leverage', 'current_ratio', 'interest_coverage'])

function formatRatio(key: string, val: number | null): string {
  if (val === null) return '—'
  const pct = ['ebitda_margin', 'gross_margin', 'net_profit_margin', 'return_on_assets']
  if (pct.includes(key)) return `${(val * 100).toFixed(1)}%`
  return `${val.toFixed(2)}x`
}

// A null ratio has not been evaluated against anything — it is neither
// passing nor failing, so it must never render in pass-green. Every caller
// below checks `val === null` first and falls back to a neutral tone before
// ever consulting `breaches`/`near_threshold`, which only describe ratios
// that were actually computed.
function cellColor(key: string, period: PeriodAnalytics, val: number | null): string {
  if (!THRESHOLD_KEYS.has(key)) return 'text-[var(--text-primary)]'
  if (val === null) return 'text-[var(--text-secondary)]'
  if (period.breaches.includes(key)) return 'text-[var(--breach)] font-bold'
  if (period.near_threshold.includes(key)) return 'text-[var(--near)] font-semibold'
  return 'text-[var(--pass)] font-semibold'
}

function cardBorderColor(key: string, period: PeriodAnalytics, val: number | null): string {
  if (val === null) return 'border-t-[var(--border)]'
  if (period.breaches.includes(key)) return 'border-t-[var(--breach)]'
  if (period.near_threshold.includes(key)) return 'border-t-[var(--near)]'
  return 'border-t-[var(--pass)]'
}

function cardStatusText(key: string, period: PeriodAnalytics, val: number | null): string {
  if (val === null) return 'not yet computed'
  if (period.breaches.includes(key)) return '⚠ breach'
  if (period.near_threshold.includes(key)) return '~ near threshold'
  return '✓ passing'
}

function cardStatusColor(key: string, period: PeriodAnalytics, val: number | null): string {
  if (val === null) return 'text-[var(--text-secondary)]'
  if (period.breaches.includes(key)) return 'text-[var(--breach)]'
  if (period.near_threshold.includes(key)) return 'text-[var(--near)]'
  return 'text-[var(--pass)]'
}

export default function KpiSection({ spreadId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', spreadId],
    queryFn: () => getAnalytics(spreadId),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="py-12 text-center text-[var(--text-secondary)]">Loading ratios...</div>
    )
  }

  if (isError) {
    return (
      <div className="py-12 text-center text-[var(--breach)]">
        Failed to load ratios. Please refresh.
      </div>
    )
  }

  if (!data || data.periods.length === 0) {
    return (
      <div className="py-12 text-center text-[var(--text-secondary)]">
        <p>No periods yet. Add a fiscal year period in the Spread tab to see ratios.</p>
      </div>
    )
  }

  const latestActual = data.periods
    .filter(p => p.period_type === 'actual')
    .sort((a, b) => a.fiscal_year - b.fiscal_year)
    .at(-1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Credit Ratios</h2>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          {data.periods.length} period{data.periods.length !== 1 ? 's' : ''} loaded
          · Default thresholds applied
        </p>
      </div>

      {/* Top row — 4 threshold ratio cards (latest actual period) */}
      {latestActual && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {THRESHOLD_RATIOS.map(({ key, label, threshold }) => {
            const val = latestActual.ratios[key]
            return (
              <div
                key={key}
                className={`bg-[var(--bg-card)] rounded-xl p-4 border-t-4 border border-[var(--border)] ${cardBorderColor(key, latestActual, val)}`}
              >
                <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                  {label}
                </div>
                <div className="text-2xl font-black text-[var(--text-primary)] leading-tight mb-1">
                  {formatRatio(key, val)}
                </div>
                <div className={`text-[11px] font-semibold ${cardStatusColor(key, latestActual, val)}`}>
                  {cardStatusText(key, latestActual, val)}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">{threshold}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Margin trend strip */}
      {latestActual && (
        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            Margin Trends (all periods)
          </div>
          <div className="flex flex-wrap gap-6">
            {(['ebitda_margin', 'gross_margin', 'net_profit_margin'] as const).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {RATIO_LABEL_MAP.get(key)}
                </span>
                <span className="text-[var(--text-secondary)] text-xs">
                  {[...data.periods]
                    .sort((a, b) => a.fiscal_year - b.fiscal_year)
                    .map((p, i) => (
                      <span key={p.period_id}>
                        {i > 0 && <span className="mx-1 opacity-50">→</span>}
                        <span className={p === latestActual ? 'text-[var(--accent)] font-bold' : ''}>
                          {formatRatio(key, p.ratios[key])}
                        </span>
                      </span>
                    ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full ratio table — all 8 ratios × all periods */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-[var(--border)]">
              <th className="text-left px-4 py-3 text-[var(--text-secondary)] font-semibold text-xs uppercase tracking-wide w-48">
                Ratio
              </th>
              <th className="text-center px-3 py-3 text-[var(--text-secondary)] font-semibold text-xs uppercase tracking-wide">
                Threshold
              </th>
              {[...data.periods]
                .sort((a, b) => a.fiscal_year - b.fiscal_year)
                .map((p) => (
                  <th
                    key={p.period_id}
                    className={`text-right px-4 py-3 font-bold text-xs uppercase tracking-wide ${
                      p === latestActual
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    FY {p.fiscal_year}
                    {p.period_type === 'projected' && (
                      <span className="text-[var(--text-secondary)] font-normal"> (P)</span>
                    )}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {ALL_RATIOS.map(({ key, label }, idx) => (
              <tr
                key={key}
                className={`border-b border-[var(--border)] ${idx % 2 === 0 ? 'bg-[var(--bg-page)]' : ''}`}
              >
                <td className="px-4 py-3 font-semibold text-[var(--text-primary)] text-xs">
                  {label}
                </td>
                <td className="px-3 py-3 text-center text-[var(--text-secondary)] text-xs">
                  {THRESHOLD_MAP.get(key) ?? '—'}
                </td>
                {[...data.periods]
                  .sort((a, b) => a.fiscal_year - b.fiscal_year)
                  .map((p) => (
                    <td
                      key={p.period_id}
                      className={`px-4 py-3 text-right text-xs ${cellColor(key, p, p.ratios[key])}`}
                    >
                      {formatRatio(key, p.ratios[key])}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 flex gap-4 text-[10px] text-[var(--text-secondary)] border-t border-[var(--border)] bg-[var(--bg-page)]">
          <span><span className="text-[var(--pass)] font-bold">●</span> Passes</span>
          <span><span className="text-[var(--breach)] font-bold">●</span> Breach</span>
          <span><span className="text-[var(--near)] font-bold">●</span> Near threshold</span>
          <span>Latest period in <span className="text-[var(--accent)] font-bold">amber</span></span>
        </div>
      </div>
    </div>
  )
}
