import { useQuery } from '@tanstack/react-query'
import { getSpreadHistory } from '../api/workflow'
import type { AuditEntry } from '../types'

interface Props {
  spreadId: number
}

function fmt(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  completed: 'Submitted',
  reviewed: 'Reviewed',
  exported: 'Exported',
}

export default function StatusHistory({ spreadId }: Props) {
  const { data: history = [] } = useQuery<AuditEntry[]>({
    queryKey: ['spread-history', spreadId],
    queryFn: () => getSpreadHistory(spreadId),
    staleTime: 0,
  })

  if (history.length === 0) return null

  const nodes: { label: string; meta?: string }[] = [{ label: 'Draft' }]
  for (const entry of history) {
    nodes.push({
      label: STATUS_LABELS[entry.new_status] ?? entry.new_status,
      meta: `${entry.changed_by_name} · ${fmt(entry.timestamp)}`,
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-secondary)] py-2 px-4 border-b border-[var(--border)]">
      {nodes.map((node, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-[var(--border)]">→</span>}
          <span>
            <span className="font-medium text-[var(--text-primary)]">{node.label}</span>
            {node.meta && <span className="ml-1">({node.meta})</span>}
          </span>
        </span>
      ))}
    </div>
  )
}
