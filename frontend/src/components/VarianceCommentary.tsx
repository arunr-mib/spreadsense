import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getAnalytics } from '../api/analytics'
import {
  generateVarianceCommentary,
  type VarianceBullet,
  type VarianceCategory,
  type VarianceCommentaryResponse,
} from '../api/varianceCommentary'

interface Props {
  spreadId: number
}

const CATEGORY_META: Record<
  VarianceCategory,
  { label: string; bg: string; text: string }
> = {
  revenue: { label: 'Revenue', bg: 'bg-sky-50', text: 'text-sky-700' },
  margins: { label: 'Margins', bg: 'bg-amber-50', text: 'text-amber-700' },
  liquidity: { label: 'Liquidity', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  leverage: { label: 'Leverage', bg: 'bg-rose-50', text: 'text-rose-700' },
  working_capital: {
    label: 'Working Capital',
    bg: 'bg-violet-50',
    text: 'text-violet-700',
  },
  watch: { label: 'Watch', bg: 'bg-yellow-100', text: 'text-yellow-800' },
}

function periodCount(analytics: { periods: unknown[] } | undefined): number {
  return analytics?.periods.length ?? 0
}

export default function VarianceCommentary({ spreadId }: Props) {
  const [result, setResult] = useState<VarianceCommentaryResponse | null>(null)

  const { data: analytics } = useQuery({
    queryKey: ['analytics', spreadId],
    queryFn: () => getAnalytics(spreadId),
    staleTime: 30_000,
  })

  const hasEnoughPeriods = periodCount(analytics) >= 2

  const mutation = useMutation({
    mutationFn: () => generateVarianceCommentary(spreadId),
    onSuccess: (data) => setResult(data),
  })

  const errorMessage =
    (mutation.error as { response?: { data?: { detail?: string } } } | null)
      ?.response?.data?.detail ??
    (mutation.error ? 'Generation failed — try again.' : null)

  return (
    <div className="bg-white border border-indigo-200 rounded-lg p-5 mb-4 shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-indigo-700 font-semibold">
            AI Variance Commentary
          </div>
          <div className="text-sm text-slate-500 mt-0.5">
            Material period-over-period changes, surfaced by Claude in seconds.
          </div>
        </div>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!hasEnoughPeriods || mutation.isPending}
          className="shrink-0 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed"
        >
          {mutation.isPending
            ? '⟳ Analyzing…'
            : result
              ? '↻ Regenerate'
              : '✨ Explain changes'}
        </button>
      </div>

      {!hasEnoughPeriods && (
        <div className="text-sm text-slate-500 italic">
          Add a second fiscal year period to enable variance commentary.
        </div>
      )}

      {mutation.isPending && (
        <div className="text-sm text-indigo-700">
          Analyzing {periodCount(analytics)} periods… typically 10–15 seconds.
        </div>
      )}

      {errorMessage && !mutation.isPending && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
          ✗ {errorMessage}
        </div>
      )}

      {result && !mutation.isPending && (
        <div>
          <div className="text-xs text-slate-500 mb-3">
            Comparing {result.periods_analyzed.join(' vs ')} · generated{' '}
            {new Date(result.generated_at).toLocaleTimeString()}
          </div>
          <ul className="space-y-2">
            {result.bullets.map((bullet, idx) => (
              <BulletRow key={idx} bullet={bullet} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function BulletRow({ bullet }: { bullet: VarianceBullet }) {
  const meta = CATEGORY_META[bullet.category]
  return (
    <li className="flex gap-3 items-start">
      <span
        className={`shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${meta.bg} ${meta.text}`}
      >
        {meta.label}
      </span>
      <span className="text-sm text-slate-700 leading-relaxed">
        {bullet.text}
      </span>
    </li>
  )
}
