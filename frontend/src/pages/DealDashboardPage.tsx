import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSpreads } from '../api/spreads'
import { useAuthStore } from '../store/auth'
import StatusBadge from '../components/StatusBadge'
import NewSpreadModal from '../components/NewSpreadModal'

export default function DealDashboardPage() {
  const [showModal, setShowModal] = useState(false)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { data: spreads = [], isLoading } = useQuery({ queryKey: ['spreads'], queryFn: getSpreads })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Deal Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Financial Spreading Tool</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.full_name}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-700">Sign out</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Spreads <span className="text-gray-400 font-normal text-base">({spreads.length})</span>
          </h2>
          <button onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium">
            + New Spread
          </button>
        </div>

        {isLoading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : spreads.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No spreads yet</p>
            <p className="text-sm mt-1">Click &quot;+ New Spread&quot; to get started</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Deal Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {spreads.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-medium text-gray-900">{s.deal_name}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-gray-500">{new Date(s.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showModal && <NewSpreadModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
