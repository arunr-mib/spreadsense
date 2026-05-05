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

interface Action {
  label: string
  targetStatus: string
  variant: 'primary' | 'secondary'
}

function getActions(
  spread: Spread,
  userId: number,
  role: string,
): Action[] {
  const actions: Action[] = []
  const isOwnerAnalyst =
    role === 'analyst' && spread.created_by === userId
  const isReviewer = role === 'sr_credit_analyst' || role === 'admin'

  if (spread.status === 'draft' && isOwnerAnalyst) {
    actions.push({
      label: 'Submit for Review',
      targetStatus: 'completed',
      variant: 'primary',
    })
  }

  if (spread.status === 'completed') {
    if (isReviewer) {
      actions.push({
        label: 'Mark as Reviewed',
        targetStatus: 'reviewed',
        variant: 'primary',
      })
    }
    if (isOwnerAnalyst || isReviewer) {
      actions.push({
        label: 'Reopen',
        targetStatus: 'draft',
        variant: 'secondary',
      })
    }
  }

  if (spread.status === 'reviewed') {
    actions.push({
      label: 'Mark as Exported',
      targetStatus: 'exported',
      variant: 'primary',
    })
  }

  return actions
}

export default function WorkflowControls({
  spread,
  currentUserId,
  currentUserRole,
  onStatusChange,
}: Props) {
  const actions = getActions(spread, currentUserId, currentUserRole)

  const mutation = useMutation({
    mutationFn: (targetStatus: string) =>
      patchSpreadStatus(spread.id, targetStatus),
    onSuccess: onStatusChange,
  })

  return (
    <div className="flex items-center gap-3">
      <StatusBadge status={spread.status} />
      {actions.map((action) => (
        <button
          key={action.targetStatus}
          onClick={() => mutation.mutate(action.targetStatus)}
          disabled={mutation.isPending}
          className={
            action.variant === 'primary'
              ? 'px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-50'
              : 'px-3 py-1.5 text-xs font-medium bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-page)] disabled:opacity-50'
          }
        >
          {mutation.isPending ? 'Saving…' : action.label}
        </button>
      ))}
    </div>
  )
}
