import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLineItems, upsertLineItem } from '../api/spreading'
import type { SpreadLineItem } from '../types'

const SOURCE_BADGE: Record<string, string> = {
  manual: 'M',
  pdf: 'PDF',
  xlsx: 'XLS',
  docx: 'DOC',
}

interface Props {
  spreadId: number
  periodId: number
  statement: 'IS' | 'BS' | 'CF'
}

export default function SpreadingGrid({ spreadId, periodId, statement }: Props) {
  const qc = useQueryClient()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: ['line-items', periodId, statement],
    queryFn: () => getLineItems(spreadId, periodId, statement),
  })

  const mutation = useMutation({
    mutationFn: ({ fieldKey, value, updatedAt }: { fieldKey: string; value: number | null; updatedAt: string | null }) =>
      upsertLineItem(spreadId, periodId, fieldKey, value, updatedAt),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['line-items', periodId, statement] }),
  })

  const handleBlur = useCallback((item: SpreadLineItem) => {
    const num = editValue === '' ? null : parseFloat(editValue)
    if (num !== null && !isNaN(num) || editValue === '') {
      mutation.mutate({ fieldKey: item.rma_field_key, value: num, updatedAt: item.updated_at })
    }
    setEditingKey(null)
  }, [editValue, mutation])

  if (isLoading) return <p className="text-[var(--text-secondary)] text-sm p-4">Loading...</p>
  if (isError) return <p className="text-red-500 text-sm p-4">Failed to load grid data.</p>

  return (
    <table className="w-full text-sm border-collapse">
      <tbody>
        {items.map((item) => (
          <tr
            key={item.rma_field_key}
            className={`border-b border-[var(--border)] ${item.computed ? 'bg-[var(--bg-page)] font-semibold' : 'bg-[var(--bg-card)]'}`}
          >
            <td className="px-4 py-2 text-[var(--text-primary)] w-64">
              {item.label}
            </td>
            <td className="px-4 py-2 text-right w-40">
              {item.computed ? (
                <span className="text-[var(--text-primary)]">
                  {item.value != null ? item.value.toLocaleString() : '—'}
                </span>
              ) : editingKey === item.rma_field_key ? (
                <input
                  autoFocus
                  className="w-full text-right border border-[var(--border)] rounded px-2 py-0.5 text-sm"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleBlur(item)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(item) }}
                />
              ) : (
                <button
                  className="w-full text-right hover:bg-[var(--bg-page)] rounded px-2 py-0.5"
                  onClick={() => {
                    setEditingKey(item.rma_field_key)
                    setEditValue(item.value != null ? String(item.value) : '')
                  }}
                >
                  {item.value != null ? item.value.toLocaleString() : <span className="text-[var(--text-secondary)]">—</span>}
                </button>
              )}
            </td>
            <td className="px-2 py-2 w-12 text-center">
              {item.source && (
                <span className="text-xs px-1 py-0.5 rounded bg-[var(--bg-page)] text-[var(--text-secondary)] font-mono">
                  {SOURCE_BADGE[item.source] ?? item.source}
                </span>
              )}
              {item.confidence_score != null && item.confidence_score < 0.85 && (
                <span className="ml-1 text-xs text-amber-500" title={`Confidence: ${(item.confidence_score * 100).toFixed(0)}%`}>⚠</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
