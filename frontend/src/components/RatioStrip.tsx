import { useQuery } from '@tanstack/react-query'
import { getAnalytics } from '../api/analytics'
import type { PeriodAnalytics } from '../types'

interface Props {
  spreadId: number
  activeSection: 'spread' | 'kpis' | 'narrative'
  onSectionChange: (section: 'spread' | 'kpis' | 'narrative') => void
}

const RATIO_LABELS: { key: keyof PeriodAnalytics['ratios']; label: string; shortLabel: string }[] = [
  { key: 'dscr', label: 'DSCR', shortLabel: 'DSCR' },
  { key: 'leverage', label: 'Leverage', shortLabel: 'LEV' },
  { key: 'interest_coverage', label: 'Coverage', shortLabel: 'COV' },
  { key: 'current_ratio', label: 'Current Ratio', shortLabel: 'CR' },
  { key: 'ebitda_margin', label: 'EBITDA Margin', shortLabel: 'EBITDA%' },
]

function formatRatio(key: string, val: number | null): string {
  if (val === null) return '—'
  if (['ebitda_margin', 'gross_margin', 'net_profit_margin', 'return_on_assets'].includes(key)) {
    return `${(val * 100).toFixed(1)}%`
  }
  return `${val.toFixed(2)}x`
}

export default function RatioStrip({ spreadId, activeSection, onSectionChange }: Props) {
  const { data } = useQuery({
    queryKey: ['analytics', spreadId],
    queryFn: () => getAnalytics(spreadId),
    staleTime: 30_000,
  })

  // Latest actual period — sort by fiscal_year ascending so .at(-1) is the most recent
  const latestPeriod = data?.periods
    .filter(p => p.period_type === 'actual')
    .sort((a, b) => a.fiscal_year - b.fiscal_year)
    .at(-1) ?? null

  const ratioColor = (key: string, val: number | null, period: PeriodAnalytics | null) => {
    if (!period || val === null) return 'text-[#94a3b8]'
    if (period.breaches.includes(key)) return 'text-[var(--breach)]'
    if (period.near_threshold.includes(key)) return 'text-[var(--near)]'
    if (['dscr', 'leverage', 'current_ratio', 'interest_coverage'].includes(key)) {
      return 'text-[var(--pass)]'
    }
    return 'text-[#e2e8f0]'
  }

  const navItems: { key: 'spread' | 'kpis' | 'narrative'; label: string }[] = [
    { key: 'spread', label: 'Spread' },
    { key: 'kpis', label: 'KPIs' },
    { key: 'narrative', label: 'Narrative' },
  ]

  return (
    <div className="bg-[var(--bg-strip)] px-4 py-2 flex items-center gap-2">
      {/* Ratio values */}
      <div className="flex flex-1 min-w-0">
        {RATIO_LABELS.map(({ key, label, shortLabel }, i) => (
          <div
            key={key}
            className={`flex-1 text-center px-2 min-w-0 ${i < RATIO_LABELS.length - 1 ? 'border-r border-[#3d3020]' : ''}`}
          >
            <div className="text-[9px] text-[#92805a] uppercase tracking-widest hidden sm:block truncate">
              {label}
            </div>
            <div className="text-[9px] text-[#92805a] uppercase tracking-widest sm:hidden">
              {shortLabel}
            </div>
            <div className={`text-sm font-bold leading-tight ${ratioColor(key, latestPeriod?.ratios[key] ?? null, latestPeriod)}`}>
              {formatRatio(key, latestPeriod?.ratios[key] ?? null)}
            </div>
          </div>
        ))}
      </div>

      {/* Sub-nav */}
      <div className="flex gap-0.5 bg-[#1a1510] rounded-md p-0.5 ml-3 shrink-0">
        {navItems.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onSectionChange(key)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeSection === key
                ? 'bg-[var(--accent)] text-white'
                : 'text-[#6b5a38] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
