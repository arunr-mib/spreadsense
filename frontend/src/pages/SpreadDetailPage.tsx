import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSpreads } from '../api/spreads'
import { getPeriods, createPeriod } from '../api/spreading'
import SpreadingGrid from '../components/SpreadingGrid'
import type { SpreadPeriod } from '../types'

type Statement = 'IS' | 'BS' | 'CF'

const STATEMENT_LABELS: Record<Statement, string> = {
  IS: 'Income Statement',
  BS: 'Balance Sheet',
  CF: 'UCA Cash Flow',
}

export default function SpreadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const spreadId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Statement>('IS')
  const [activePeriodId, setActivePeriodId] = useState<number | null>(null)
  const [showAddPeriod, setShowAddPeriod] = useState(false)
  const [newYear, setNewYear] = useState('')
  const [newType, setNewType] = useState<'actual' | 'projected'>('actual')

  const { data: spreads = [] } = useQuery({ queryKey: ['spreads'], queryFn: getSpreads })
  const spread = spreads.find((s) => s.id === spreadId)

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
      setActivePeriodId(newPeriod.id)
      setShowAddPeriod(false)
      setNewYear('')
    },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-700 text-sm">
          ← Dashboard
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{spread?.deal_name ?? 'Spread'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">Spread #{spreadId}</p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Period selector */}
        <div className="flex items-center gap-3 mb-6 overflow-x-auto">
          <span className="text-sm text-gray-500 shrink-0">Period:</span>
          {periodsLoading ? (
            <span className="text-gray-400 text-sm">Loading...</span>
          ) : (
            periods.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePeriodId(p.id)}
                className={`px-3 py-1 rounded text-sm shrink-0 ${
                  activePeriodId === p.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border text-gray-700 hover:bg-gray-50'
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
            className="px-3 py-1 rounded text-sm border border-dashed text-gray-400 hover:text-indigo-600 hover:border-indigo-400 shrink-0"
          >
            + Add Period
          </button>
        </div>

        {/* Add Period form */}
        {showAddPeriod && (
          <div className="mb-4 flex items-center gap-3 bg-white border rounded-lg p-4 w-fit">
            <input
              type="number"
              placeholder="Fiscal Year (e.g. 2023)"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              className="border rounded px-3 py-1 text-sm w-48"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as 'actual' | 'projected')}
              className="border rounded px-3 py-1 text-sm"
            >
              <option value="actual">Actual</option>
              <option value="projected">Projected</option>
            </select>
            <button
              disabled={!newYear || addPeriodMutation.isPending}
              onClick={() => addPeriodMutation.mutate()}
              className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              Add
            </button>
            {addPeriodMutation.isError && (
              <span className="text-red-500 text-xs">Failed (duplicate year?)</span>
            )}
          </div>
        )}

        {/* Statement tabs */}
        <div className="flex gap-1 mb-4">
          {(Object.keys(STATEMENT_LABELS) as Statement[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm rounded-t-lg font-medium ${
                activeTab === tab
                  ? 'bg-white border border-b-white text-indigo-600'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {STATEMENT_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="bg-white border rounded-b-lg rounded-tr-lg overflow-hidden">
          {activePeriodId ? (
            <SpreadingGrid
              spreadId={spreadId}
              periodId={activePeriodId}
              statement={activeTab}
            />
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p>Add a fiscal year period above to start entering data.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
