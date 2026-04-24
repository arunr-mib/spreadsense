import { useRef, useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { uploadDocument, getExtractionJob, confirmExtraction } from '../api/ingestion'
import type { ExtractionJob, SpreadPeriod } from '../types'

interface Props {
  spreadId: number
  periods: SpreadPeriod[]
  onConfirmed: () => void
}

type PanelState = 'idle' | 'extracting' | 'review' | 'error'

const PHASE_PCT: Record<string, number> = {
  uploading: 10, parsing: 25,
  extracting_is: 50, extracting_bs: 70, extracting_cf: 90, ready: 100,
}

const CONFIDENCE_HIGH = 0.85
const CONFIDENCE_MED = 0.60

type ConfidenceTier = 'HIGH' | 'MED' | 'LOW'

function tier(score: number): ConfidenceTier {
  if (score >= CONFIDENCE_HIGH) return 'HIGH'
  if (score >= CONFIDENCE_MED) return 'MED'
  return 'LOW'
}

const TIER_ROW: Record<ConfidenceTier, string> = {
  HIGH: 'bg-green-950/30',
  MED: 'bg-yellow-950/30 border-l-2 border-yellow-400',
  LOW: 'bg-red-950/30 border-l-2 border-red-400',
}
const TIER_BADGE: Record<ConfidenceTier, string> = {
  HIGH: 'text-green-400',
  MED: 'text-yellow-400',
  LOW: 'text-red-400',
}
const TIER_LABEL: Record<ConfidenceTier, string> = {
  HIGH: '● HIGH',
  MED: '● MED',
  LOW: '⚠ LOW',
}

function stmtLabel(key: string) {
  return { IS: 'Income Statement', BS: 'Balance Sheet', CF: 'Cash Flow' }[key] ?? key
}

export default function ExtractionPanel({ spreadId, periods, onConfirmed }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [activeJobId, setActiveJobId] = useState<number | null>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(periods[0]?.id ?? null)
  const [overrides, setOverrides] = useState<Record<string, number>>({})

  // Upload mutation
  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadDocument(spreadId, file),
    onSuccess: (job) => {
      setActiveJobId(job.id)
      setPanelState('extracting')
    },
    onError: () => setPanelState('error'),
  })

  // Poll job status while extracting
  const { data: job } = useQuery<ExtractionJob>({
    queryKey: ['extraction-job', activeJobId],
    queryFn: () => getExtractionJob(activeJobId!),
    enabled: panelState === 'extracting' && activeJobId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s && s !== 'processing' ? false : 2000
    },
    gcTime: 0,
  })

  // Transition when job reaches terminal state
  useEffect(() => {
    if (panelState !== 'extracting' || !job) return
    if (job.status === 'ready') {
      // Pre-seed overrides for MED/LOW fields
      const seed: Record<string, number> = {}
      for (const [stmt, fields] of Object.entries(job.results ?? {})) {
        for (const [key, { value, confidence_score }] of Object.entries(fields)) {
          if (tier(confidence_score) !== 'HIGH' && value !== null) {
            seed[`${stmt}.${key}`] = value
          }
        }
      }
      setOverrides(seed)
      setPanelState('review')
    } else if (job.status === 'failed') {
      setPanelState('error')
    }
  }, [job?.status, panelState])

  // Confirm mutation
  const confirmMut = useMutation({
    mutationFn: () => confirmExtraction(activeJobId!, selectedPeriodId!, overrides),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['line-items'] })
      qc.invalidateQueries({ queryKey: ['analytics', spreadId] })
      onConfirmed()
    },
  })

  const handleFile = (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      alert('File too large (max 50 MB)')
      return
    }
    uploadMut.mutate(file)
  }

  // Build review rows sorted: LOW first, MED next, HIGH last
  const reviewRows = (() => {
    if (!job?.results) return []
    const rows: { compositeKey: string; stmt: string; key: string; value: number | null; score: number; t: ConfidenceTier }[] = []
    for (const [stmt, fields] of Object.entries(job.results)) {
      for (const [key, { value, confidence_score }] of Object.entries(fields)) {
        rows.push({ compositeKey: `${stmt}.${key}`, stmt, key, value, score: confidence_score, t: tier(confidence_score) })
      }
    }
    const order: Record<ConfidenceTier, number> = { LOW: 0, MED: 1, HIGH: 2 }
    return rows.sort((a, b) => order[a.t] - order[b.t])
  })()

  const allLowResolved = reviewRows
    .filter((r) => r.t === 'LOW')
    .every((r) => overrides[r.compositeKey] !== undefined)

  // ── IDLE ──
  if (panelState === 'idle' || uploadMut.isPending) {
    return (
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-[var(--accent)] bg-[var(--bg-page)]' : 'border-[var(--border)] hover:border-[var(--text-secondary)]'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => !uploadMut.isPending && fileRef.current?.click()}
      >
        <input
          ref={fileRef} type="file" className="hidden"
          accept=".pdf,.docx,.xlsx"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {uploadMut.isPending ? (
          <p className="text-sm text-[var(--accent)] animate-pulse">Uploading…</p>
        ) : (
          <>
            <div className="text-4xl mb-3">📄</div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Drop PDF, Word, or Excel file here</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">or click to browse · max 50 MB</p>
          </>
        )}
      </div>
    )
  }

  // ── EXTRACTING ──
  if (panelState === 'extracting') {
    const phase = job?.phase ?? 'uploading'
    const pct = PHASE_PCT[phase] ?? 10
    const stmtStatus = (active: string, done: string) => {
      if (!phase || phase === 'uploading' || phase === 'parsing') return '○'
      if (phase === active) return '⏳'
      if (phase === done || phase === 'ready') return '✓'
      const order = ['extracting_is', 'extracting_bs', 'extracting_cf', 'ready']
      return order.indexOf(phase) > order.indexOf(active) ? '✓' : '○'
    }
    return (
      <div className="border border-[var(--border)] rounded-xl p-6">
        <p className="text-sm font-medium text-[var(--accent)] mb-4">⚙️ AI Extraction in Progress</p>
        <div className="bg-[var(--bg-page)] rounded-full h-2 mb-2 overflow-hidden">
          <div
            className="bg-[var(--accent)] h-2 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-4">{pct}%</p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            { label: 'Income Statement', active: 'extracting_is', done: 'extracting_bs' },
            { label: 'Balance Sheet', active: 'extracting_bs', done: 'extracting_cf' },
            { label: 'Cash Flow', active: 'extracting_cf', done: 'ready' },
          ].map(({ label, active, done }) => (
            <div key={label} className="flex items-center gap-2 text-[var(--text-secondary)]">
              <span className={stmtStatus(active, done) === '✓' ? 'text-green-400' : stmtStatus(active, done) === '⏳' ? 'text-[var(--accent)]' : ''}>
                {stmtStatus(active, done)}
              </span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── ERROR ──
  if (panelState === 'error') {
    return (
      <div className="border border-[var(--breach)] rounded-xl p-6 text-center">
        <p className="text-sm text-[var(--breach)] mb-4">Extraction failed. Please try again.</p>
        <button
          onClick={() => { setPanelState('idle'); setActiveJobId(null); setOverrides({}) }}
          className="px-4 py-2 text-sm border border-[var(--border)] text-[var(--text-secondary)] rounded-lg hover:text-[var(--text-primary)]"
        >
          Try Again
        </button>
      </div>
    )
  }

  // ── REVIEW ──
  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Period selector */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <span className="text-sm text-[var(--text-secondary)]">Write to period:</span>
        <select
          value={selectedPeriodId ?? ''}
          onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
          className="border border-[var(--border)] rounded px-2 py-1 text-sm bg-[var(--bg-page)] text-[var(--text-primary)]"
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>FY {p.fiscal_year} {p.period_type === 'projected' ? '(P)' : ''}</option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-secondary)] ml-auto">
          {reviewRows.filter((r) => r.t !== 'HIGH').length} fields need review
        </span>
      </div>

      {/* Review table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-page)] border-b border-[var(--border)]">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Statement</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Field</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Extracted</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Override</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {reviewRows.map(({ compositeKey, stmt, key, value, score, t }) => (
              <tr key={compositeKey} className={`border-b border-[var(--border)] last:border-0 ${TIER_ROW[t]}`}>
                <td className="px-4 py-2 text-xs text-[var(--text-secondary)]">{stmtLabel(stmt)}</td>
                <td className="px-4 py-2 text-[var(--text-primary)]">{key.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2 text-[var(--text-secondary)]">{value !== null ? value.toLocaleString() : '—'}</td>
                <td className="px-4 py-2">
                  {t !== 'HIGH' ? (
                    <input
                      type="number"
                      value={overrides[compositeKey] ?? ''}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [compositeKey]: Number(e.target.value) }))}
                      className="w-32 border border-[var(--border)] rounded px-2 py-1 text-sm bg-[var(--bg-page)] text-[var(--text-primary)]"
                    />
                  ) : (
                    <span className="text-[var(--text-secondary)] text-xs">—</span>
                  )}
                </td>
                <td className={`px-4 py-2 text-xs font-medium ${TIER_BADGE[t]}`}>
                  {TIER_LABEL[t]} {Math.round(score * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm bar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-card)]">
        {confirmMut.isError && (
          <p className="text-xs text-[var(--breach)]">Failed to save. Please try again.</p>
        )}
        <div className="ml-auto flex gap-3">
          <button
            onClick={() => { setPanelState('idle'); setActiveJobId(null); setOverrides({}) }}
            className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            onClick={() => confirmMut.mutate()}
            disabled={!selectedPeriodId || !allLowResolved || confirmMut.isPending}
            className="px-4 py-1.5 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
          >
            {confirmMut.isPending ? 'Saving…' : 'Confirm & Write to Grid'}
          </button>
        </div>
      </div>
    </div>
  )
}
