import type { Spread } from '../types'

const STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  completed: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-green-100 text-green-700',
  exported: 'bg-purple-100 text-purple-700',
}

export default function StatusBadge({ status }: { status: Spread['status'] }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STYLES[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}
