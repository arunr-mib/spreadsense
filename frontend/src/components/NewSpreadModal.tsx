import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBorrowers } from '../api/borrowers'
import { createSpread } from '../api/spreads'

interface Props { onClose: () => void }

export default function NewSpreadModal({ onClose }: Props) {
  const [borrowerId, setBorrowerId] = useState<number | ''>('')
  const [dealName, setDealName] = useState('')
  const qc = useQueryClient()

  const { data: borrowers = [] } = useQuery({ queryKey: ['borrowers'], queryFn: getBorrowers })
  const mutation = useMutation({
    mutationFn: createSpread,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spreads'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">New Spread</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="borrower" className="block text-sm font-medium text-gray-700 mb-1">Borrower</label>
            <select id="borrower" value={borrowerId} onChange={e => setBorrowerId(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select borrower...</option>
              {borrowers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="deal-name" className="block text-sm font-medium text-gray-700 mb-1">Deal Name</label>
            <input id="deal-name" value={dealName} onChange={e => setDealName(e.target.value)}
              placeholder="e.g. Term Loan 2026"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            disabled={!borrowerId || !dealName || mutation.isPending}
            onClick={() => mutation.mutate({ borrower_id: Number(borrowerId), deal_name: dealName })}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {mutation.isPending ? 'Creating...' : 'Create Spread'}
          </button>
        </div>
      </div>
    </div>
  )
}
