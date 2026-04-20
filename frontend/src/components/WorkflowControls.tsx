import { useMutation } from '@tanstack/react-query'
import { patchSpreadStatus } from '../api/workflow'
import StatusBadge from './StatusBadge'
import type { Spread } from '../types'

interface Props {
  spread: Spread
  currentUserId: number
  currentUserRole: string
  onStatusChange: () => void
}

function getNextAction(
  spread: Spread,
  userId: number,
  role: string,
): { label: string; targetStatus: string } | null {
  if (spread.status === 'draft' && role === 'analyst' && spread.created_by === userId) {
    return { label: 'Submit for Review', targetStatus: 'completed' }
  }
  if (spread.status === 'completed' && (role === 'sr_credit_analyst' || role === 'admin')) {
    return { label: 'Mark as Reviewed', targetStatus: 'reviewed' }
  }
  if (spread.status === 'reviewed') {
    return { label: 'Mark as Exported', targetStatus: 'exported' }
  }
  return null
}

export default function WorkflowControls({ spread, currentUserId, currentUserRole, onStatusChange }: Props) {
  const action = getNextAction(spread, currentUserId, currentUserRole)

  const mutation = useMutation({
    mutationFn: (targetStatus: string) => patchSpreadStatus(spread.id, targetStatus),
    onSuccess: onStatusChange,
  })

  return (
    <div className="flex items-center gap-3">
      <StatusBadge status={spread.status} />
      {action && (
        <button
          onClick={() => mutation.mutate(action.targetStatus)}
          disabled={mutation.isPending}
          className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : action.label}
        </button>
      )}
    </div>
  )
}
