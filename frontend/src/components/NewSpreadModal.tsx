import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBorrowers, createBorrower } from '../api/borrowers'
import { createSpread } from '../api/spreads'

interface Props { onClose: () => void }

const NEW_BORROWER_SENTINEL = '__new__'

export default function NewSpreadModal({ onClose }: Props) {
  const [borrowerId, setBorrowerId] = useState<number | ''>('')
  const [newBorrowerName, setNewBorrowerName] = useState('')
  const [dealName, setDealName] = useState('')
  const qc = useQueryClient()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const { data: borrowers = [], isError: borrowersError } = useQuery({ queryKey: ['borrowers'], queryFn: getBorrowers })

  const isCreatingBorrower = (borrowerId as unknown as string) === NEW_BORROWER_SENTINEL

  const spreadMutation = useMutation({
    mutationFn: createSpread,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spreads'] })
      qc.invalidateQueries({ queryKey: ['borrowers'] })
      onClose()
    },
  })

  const handleSubmit = async () => {
    if (!dealName) return
    if (isCreatingBorrower) {
      if (!newBorrowerName.trim()) return
      const borrower = await createBorrower(newBorrowerName.trim())
      spreadMutation.mutate({ borrower_id: borrower.id, deal_name: dealName })
    } else {
      if (!borrowerId) return
      spreadMutation.mutate({ borrower_id: Number(borrowerId), deal_name: dealName })
    }
  }

  const canSubmit = dealName.trim() &&
    (isCreatingBorrower ? newBorrowerName.trim() : !!borrowerId) &&
    !spreadMutation.isPending

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">New Spread</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="borrower" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Borrower</label>
            <select
              id="borrower"
              value={isCreatingBorrower ? NEW_BORROWER_SENTINEL : borrowerId}
              onChange={e => setBorrowerId(e.target.value === NEW_BORROWER_SENTINEL ? NEW_BORROWER_SENTINEL as unknown as number : Number(e.target.value))}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-page)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="">Select borrower...</option>
              {borrowers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value={NEW_BORROWER_SENTINEL}>＋ New borrower…</option>
            </select>
            {borrowersError && (
              <p className="text-[var(--breach)] text-xs mt-1">Failed to load borrowers.</p>
            )}
          </div>

          {isCreatingBorrower && (
            <div>
              <label htmlFor="new-borrower-name" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Borrower Name</label>
              <input
                id="new-borrower-name"
                value={newBorrowerName}
                onChange={e => setNewBorrowerName(e.target.value)}
                placeholder="e.g. Acme Corp"
                autoFocus
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-page)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
          )}

          <div>
            <label htmlFor="deal-name" className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Deal Name</label>
            <input
              id="deal-name"
              value={dealName}
              onChange={e => setDealName(e.target.value)}
              placeholder="e.g. Term Loan 2026"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-page)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          {spreadMutation.isError && (
            <p className="text-[var(--breach)] text-xs self-center">Failed to create spread. Please try again.</p>
          )}
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
          <button
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {spreadMutation.isPending ? 'Creating...' : 'Create Spread'}
          </button>
        </div>
      </div>
    </div>
  )
}
