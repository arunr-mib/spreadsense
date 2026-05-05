import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSpreads } from '../api/spreads'
import { getBorrowerById } from '../api/borrowers'
import { getPeriods, createPeriod } from '../api/spreading'
import SpreadingGrid from '../components/SpreadingGrid'
import ExtractionPanel from '../components/ExtractionPanel'
import RatioStrip from '../components/RatioStrip'
import KpiSection from '../components/KpiSection'
import VarianceCommentary from '../components/VarianceCommentary'
import AskFiling from '../components/AskFiling'
import NarrativeSection from '../components/NarrativeSection'
import MemoSection from '../components/MemoSection'
import WorkflowControls from '../components/WorkflowControls'
import StatusHistory from '../components/StatusHistory'
import { useAuthStore } from '../store/auth'
import type { SpreadPeriod } from '../types'

type Statement = 'IS' | 'BS' | 'CF'
type Section = 'spread' | 'kpis' | 'narrative' | 'memo'

const STATEMENT_LABELS: Record<Statement, string> = {
  IS: 'Income Statement',
  BS: 'Balance Sheet',
  CF: 'UCA Cash Flow',
}

export default function SpreadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const spreadId = Number(id)
  const qc = useQueryClient()

  const [activeSection, setActiveSection] = useState<Section>('spread')
  const [activeTab, setActiveTab] = useState<Statement>('IS')
  const [activePeriodId, setActivePeriodId] = useState<number | null>(null)
  const [showAddPeriod, setShowAddPeriod] = useState(false)
  const [newYear, setNewYear] = useState('')
  const [newType, setNewType] = useState<'actual' | 'projected'>('actual')
  const [showExtractionPanel, setShowExtractionPanel] = useState(false)

  const user = useAuthStore((s) => s.user)
  const { data: spreads = [] } = useQuery({ queryKey: ['spreads'], queryFn: getSpreads })
  const spread = spreads.find((s) => s.id === spreadId)

  const { data: borrower } = useQuery({
    queryKey: ['borrower', spread?.borrower_id],
    queryFn: () => getBorrowerById(spread!.borrower_id),
    enabled: !!spread?.borrower_id,
  })

  const { data: periods = [], isLoading: periodsLoading } = useQuery({
    queryKey: ['periods', spreadId],
    queryFn: () => getPeriods(spreadId),
    enabled: !!spreadId,
  })

  // Auto-select first period when periods load (React Query v5: use useEffect instead of onSuccess)
  useEffect(() => {
    if (!activePeriodId && periods.length > 0) {
      setActivePeriodId(periods[0].id)
    }
  }, [periods, activePeriodId])

  const addPeriodMutation = useMutation({
    mutationFn: () => createPeriod(spreadId, { fiscal_year: Number(newYear), period_type: newType }),
    onSuccess: (newPeriod: SpreadPeriod) => {
      qc.invalidateQueries({ queryKey: ['periods', spreadId] })
      qc.invalidateQueries({ queryKey: ['analytics', spreadId] })
      setActivePeriodId(newPeriod.id)
      setShowAddPeriod(false)
      setNewYear('')
    },
  })

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      {/* Header */}
      <header className="bg-[var(--bg-card)] border-b border-[var(--border)] px-6 py-4 flex items-center gap-4">
        <Link
          to={`/borrowers/${spread?.borrower_id}`}
          className="text-[var(--accent)] hover:opacity-80 text-sm"
        >
          ← {borrower?.name ?? '...'}
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">{spread?.deal_name ?? 'Spread'}</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Spread #{spreadId}</p>
        </div>
        {spread && user && (
          <WorkflowControls
            spread={spread}
            currentUserId={user.user_id}
            currentUserRole={user.role}
            onStatusChange={() => qc.invalidateQueries({ queryKey: ['spreads'] })}
          />
        )}
      </header>
      {spread && <StatusHistory spreadId={spreadId} />}

      {/* Persistent ratio strip + sub-nav */}
      <RatioStrip
        spreadId={spreadId}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* ── SPREAD SECTION ── */}
        {activeSection === 'spread' && (
          <>
            {/* Period selector */}
            <div className="flex items-center gap-3 mb-6 overflow-x-auto">
              <span className="text-sm text-[var(--text-secondary)] shrink-0">Period:</span>
              {periodsLoading ? (
                <span className="text-[var(--text-secondary)] text-sm">Loading...</span>
              ) : (
                periods.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePeriodId(p.id)}
                    className={`px-3 py-1 rounded text-sm shrink-0 ${
                      activePeriodId === p.id
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-page)]'
                    }`}
                  >
                    FY {p.fiscal_year}
                    <span className="ml-1 text-xs opacity-70">
                      {p.period_type === 'projected' ? '(P)' : ''}
                    </span>
                  </button>
                ))
              )}
              <button
                onClick={() => setShowAddPeriod(!showAddPeriod)}
                className="px-3 py-1 rounded text-sm border border-dashed border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] shrink-0"
              >
                + Add Period
              </button>
              <button
                onClick={() => setShowExtractionPanel(!showExtractionPanel)}
                className="px-3 py-1 rounded text-sm bg-[var(--bg-page)] text-[var(--accent)] border border-[var(--border)] hover:bg-[var(--bg-card)] shrink-0"
              >
                📎 Import Document
              </button>
            </div>

            {/* Add Period form */}
            {showAddPeriod && (
              <div className="mb-4 flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 w-fit">
                <input
                  type="number"
                  placeholder="Fiscal Year (e.g. 2023)"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  className="border border-[var(--border)] rounded px-3 py-1 text-sm w-48 bg-[var(--bg-page)] text-[var(--text-primary)]"
                />
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as 'actual' | 'projected')}
                  className="border border-[var(--border)] rounded px-3 py-1 text-sm bg-[var(--bg-page)] text-[var(--text-primary)]"
                >
                  <option value="actual">Actual</option>
                  <option value="projected">Projected</option>
                </select>
                <button
                  disabled={!newYear || addPeriodMutation.isPending}
                  onClick={() => addPeriodMutation.mutate()}
                  className="px-3 py-1 bg-[var(--accent)] text-white rounded text-sm hover:opacity-90 disabled:opacity-50"
                >
                  Add
                </button>
                {addPeriodMutation.isError && (
                  <span className="text-[var(--breach)] text-xs">Failed (duplicate year?)</span>
                )}
              </div>
            )}

            {/* Extraction Panel */}
            {showExtractionPanel && (
              <ExtractionPanel
                spreadId={spreadId}
                periods={periods}
                onConfirmed={() => {
                  setShowExtractionPanel(false)
                  qc.invalidateQueries({ queryKey: ['line-items'] })
                  qc.invalidateQueries({ queryKey: ['analytics', spreadId] })
                }}
              />
            )}

            {/* Statement tabs */}
            <div className="flex gap-1 mb-4">
              {(Object.keys(STATEMENT_LABELS) as Statement[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm rounded-t-lg font-medium ${
                    activeTab === tab
                      ? 'bg-[var(--bg-card)] border border-b-[var(--bg-card)] text-[var(--accent)]'
                      : 'bg-[var(--bg-page)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                  }`}
                >
                  {STATEMENT_LABELS[tab]}
                </button>
              ))}
            </div>

            {/* Grid */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-b-lg rounded-tr-lg overflow-hidden">
              {activePeriodId ? (
                <SpreadingGrid
                  spreadId={spreadId}
                  periodId={activePeriodId}
                  statement={activeTab}
                />
              ) : (
                <div className="text-center py-12 text-[var(--text-secondary)]">
                  <p>Add a fiscal year period above to start entering data.</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── KPI SECTION ── */}
        {activeSection === 'kpis' && (
          <>
            <VarianceCommentary spreadId={spreadId} />
            <AskFiling spreadId={spreadId} />
            <KpiSection spreadId={spreadId} />
          </>
        )}

        {/* ── NARRATIVE SECTION ── */}
        {activeSection === 'narrative' && <NarrativeSection spreadId={spreadId} />}

        {/* ── MEMO SECTION ── */}
        {activeSection === 'memo' && <MemoSection spreadId={spreadId} />}
      </div>

    </div>
  )
}
