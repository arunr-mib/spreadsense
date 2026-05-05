import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { getQbSandboxInfo, importQbTrialBalance } from '../api/quickbooks'
import type { SpreadPeriod } from '../types'

interface Props {
  spreadId: number
  periods: SpreadPeriod[]
  onImported: () => void
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'authenticating' }
  | { kind: 'connected'; company: string }
  | { kind: 'importing' }
  | { kind: 'success'; company: string; fiscalYear: number; fields: number }
  | { kind: 'error'; message: string }

export default function QuickBooksConnect({
  spreadId,
  periods,
  onImported,
}: Props) {
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [open, setOpen] = useState(false)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(
    periods[0]?.id ?? null,
  )

  const importMutation = useMutation({
    mutationFn: (periodId: number) => importQbTrialBalance(spreadId, periodId),
    onSuccess: (data) => {
      setPhase({
        kind: 'success',
        company: data.company,
        fiscalYear: data.fiscal_year,
        fields: data.fields_imported,
      })
      qc.invalidateQueries({ queryKey: ['analytics', spreadId] })
      qc.invalidateQueries({ queryKey: ['line-items'] })
      qc.invalidateQueries({ queryKey: ['periods', spreadId] })
      onImported()
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: { detail?: string } } } | null)?.response
          ?.data?.detail ?? 'Import failed'
      setPhase({ kind: 'error', message: detail })
    },
  })

  function startAuth() {
    setOpen(true)
    setPhase({ kind: 'authenticating' })
    // Simulate Intuit OAuth handshake — sandbox-info endpoint doubles as the
    // resource lookup. ~1.4s feels like a real OAuth round-trip.
    setTimeout(async () => {
      try {
        const info = await getQbSandboxInfo()
        setPhase({ kind: 'connected', company: info.company })
      } catch {
        setPhase({ kind: 'error', message: 'Could not reach QuickBooks. Try again.' })
      }
    }, 1400)
  }

  function reset() {
    setOpen(false)
    setPhase({ kind: 'idle' })
  }

  return (
    <>
      <div className="bg-white border border-emerald-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">
              Pull from QuickBooks Online
            </div>
            <div className="text-sm text-slate-500 mt-0.5">
              Connect a borrower's QuickBooks file to import the trial balance
              directly. No PDF needed.
            </div>
          </div>
          <button
            type="button"
            onClick={startAuth}
            disabled={periods.length === 0}
            className="shrink-0 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed"
          >
            Connect QuickBooks
          </button>
        </div>
        {periods.length === 0 && (
          <div className="text-xs text-slate-500 italic mt-2">
            Add a fiscal year period above first.
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded bg-emerald-600 text-white flex items-center justify-center font-bold">
                qb
              </div>
              <div>
                <div className="font-semibold text-slate-900">QuickBooks Online</div>
                <div className="text-xs text-slate-500">
                  Sandbox connection — demo only
                </div>
              </div>
            </div>

            {phase.kind === 'authenticating' && (
              <div className="py-6 text-center">
                <div className="text-sm text-slate-600 mb-2">
                  ⟳ Authenticating with Intuit…
                </div>
                <div className="text-xs text-slate-400">
                  Verifying OAuth credentials
                </div>
              </div>
            )}

            {phase.kind === 'connected' && (
              <div className="space-y-3">
                <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
                  ✓ Connected to <strong>{phase.company}</strong>
                </div>
                <div className="text-sm text-slate-600">
                  Pick the fiscal year period to import the trial balance into:
                </div>
                <select
                  value={selectedPeriodId ?? ''}
                  onChange={(e) =>
                    setSelectedPeriodId(parseInt(e.target.value, 10))
                  }
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      FY {p.fiscal_year}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedPeriodId == null) return
                      setPhase({ kind: 'importing' })
                      importMutation.mutate(selectedPeriodId)
                    }}
                    className="flex-1 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  >
                    Import Trial Balance
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="px-4 py-2 rounded-md border border-slate-300 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {phase.kind === 'importing' && (
              <div className="py-6 text-center">
                <div className="text-sm text-slate-600">
                  ⟳ Pulling Income Statement, Balance Sheet, and Cash Flow…
                </div>
              </div>
            )}

            {phase.kind === 'success' && (
              <div className="space-y-3">
                <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
                  ✓ Imported <strong>{phase.fields} line items</strong> from{' '}
                  {phase.company} for FY{phase.fiscalYear}.
                </div>
                <div className="text-xs text-slate-500">
                  Spread is now populated. Switch tabs to see line items, ratios,
                  or run variance commentary.
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="w-full px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Done
                </button>
              </div>
            )}

            {phase.kind === 'error' && (
              <div className="space-y-3">
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
                  ✗ {phase.message}
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="w-full px-4 py-2 rounded-md border border-slate-300 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
