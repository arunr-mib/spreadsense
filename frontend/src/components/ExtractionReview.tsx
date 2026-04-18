import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { confirmExtraction } from '../api/ingestion'
import type { ExtractionJob, SpreadPeriod } from '../types'

const CONFIDENCE_THRESHOLD = 0.85

interface Props {
  job: ExtractionJob
  periods: SpreadPeriod[]
  spreadId: number
  onConfirmed: () => void
  onClose: () => void
}

export default function ExtractionReview({ job, periods, onConfirmed, onClose }: Props) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | ''>(
    periods.length > 0 ? periods[0].id : ''
  )
  // resolvedKeys tracks flagged fields the analyst has accepted or corrected.
  const [resolvedKeys, setResolvedKeys] = useState<Set<string>>(new Set())
  // overrides tracks analyst-entered corrections: compositeKey -> raw string value
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => {
      const numericOverrides: Record<string, number> = {}
      Object.entries(overrides).forEach(([compositeKey, rawVal]) => {
        const parsed = parseFloat(rawVal)
        if (!isNaN(parsed)) numericOverrides[compositeKey] = parsed
      })
      return confirmExtraction(job.id, Number(selectedPeriodId), numericOverrides)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['line-items'] })
      onConfirmed()
    },
  })

  const allFields = Object.entries(job.results ?? {}).flatMap(([stmt, fields]) =>
    Object.entries(fields).map(([key, extraction]) => ({
      statement: stmt,
      key,
      compositeKey: `${stmt}.${key}`,
      value: extraction.value,
      confidence: extraction.confidence_score,
      flagged: extraction.confidence_score < CONFIDENCE_THRESHOLD,
    }))
  )

  const unresolvedFlaggedCount = allFields.filter(
    (f) => f.flagged && f.value != null && !resolvedKeys.has(f.compositeKey)
  ).length

  const canConfirm = selectedPeriodId !== '' && unresolvedFlaggedCount === 0

  const handleAccept = (compositeKey: string) => {
    setResolvedKeys((prev) => new Set([...prev, compositeKey]))
  }
  const handleOverrideChange = (compositeKey: string, val: string) => {
    setOverrides((prev) => ({ ...prev, [compositeKey]: val }))
  }
  const handleOverrideConfirm = (compositeKey: string) => {
    const val = overrides[compositeKey]
    if (val !== undefined && val !== '' && !isNaN(parseFloat(val))) {
      setResolvedKeys((prev) => new Set([...prev, compositeKey]))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Extraction Review</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            File: <span className="font-mono">{job.filename}</span>
            {unresolvedFlaggedCount > 0 && (
              <span className="ml-2 text-[var(--near)] font-medium">
                ⚠ {unresolvedFlaggedCount} field{unresolvedFlaggedCount > 1 ? 's' : ''} need review — accept or correct to enable confirm
              </span>
            )}
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {allFields.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-sm text-center py-8">No fields extracted.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-page)] border-b border-[var(--border)] sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-medium">Stmt</th>
                  <th className="text-left px-3 py-2 text-[var(--text-secondary)] font-medium">Field</th>
                  <th className="text-right px-3 py-2 text-[var(--text-secondary)] font-medium">Value</th>
                  <th className="text-right px-3 py-2 text-[var(--text-secondary)] font-medium">Confidence</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allFields.map((f) => {
                  const isResolved = resolvedKeys.has(f.compositeKey)
                  const needsReview = f.flagged && f.value != null && !isResolved
                  return (
                    <tr key={f.compositeKey}
                        className={needsReview ? 'bg-[var(--bg-page)]' : isResolved ? 'bg-[var(--bg-page)]' : ''}>
                      <td className="px-3 py-2 text-[var(--text-secondary)] font-mono">{f.statement}</td>
                      <td className="px-3 py-2 text-[var(--text-primary)] font-mono text-xs">{f.key}</td>
                      <td className="px-3 py-2 text-right text-[var(--text-primary)]">
                        {needsReview ? (
                          <input
                            type="number"
                            className="w-28 text-right border rounded px-1 py-0.5 text-sm"
                            defaultValue={f.value ?? ''}
                            onChange={(e) => handleOverrideChange(f.compositeKey, e.target.value)}
                          />
                        ) : (
                          f.value != null ? f.value.toLocaleString() : <span className="text-[var(--text-secondary)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`text-xs font-medium ${
                          isResolved ? 'text-[var(--pass)]' : f.flagged ? 'text-[var(--near)]' : 'text-[var(--pass)]'
                        }`}>
                          {(f.confidence * 100).toFixed(0)}%
                          {f.flagged && !isResolved && ' ⚠'}
                          {isResolved && ' ✓'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {needsReview && (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => handleAccept(f.compositeKey)}
                              className="text-xs px-2 py-0.5 bg-[var(--pass)] text-white rounded hover:opacity-90"
                            >Accept</button>
                            <button
                              onClick={() => handleOverrideConfirm(f.compositeKey)}
                              className="text-xs px-2 py-0.5 bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)] rounded hover:bg-[var(--bg-page)]"
                            >Use input</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--text-primary)]">Import into period:</label>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>FY {p.fiscal_year} ({p.period_type})</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Cancel
            </button>
            <button
              disabled={!canConfirm || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending ? 'Importing...' : 'Confirm & Import'}
            </button>
          </div>
        </div>

        {mutation.isError && (
          <p className="px-6 pb-4 text-red-500 text-sm">Import failed. Please try again.</p>
        )}
      </div>
    </div>
  )
}
