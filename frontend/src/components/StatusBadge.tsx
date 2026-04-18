import type { Spread } from '../types'

const STYLES: Record<string, string> = {
  draft: 'bg-[var(--bg-card)] text-[var(--text-secondary)]',
  completed: 'bg-[var(--bg-card)] text-[var(--accent)] border border-[var(--border)]',
  reviewed: 'bg-[var(--pass)] bg-opacity-10 text-[var(--pass)]',
  exported: 'bg-[var(--bg-card)] text-[var(--text-secondary)]',
}

export default function StatusBadge({ status }: { status: Spread['status'] }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STYLES[status] ?? 'bg-[var(--bg-card)] text-[var(--text-secondary)]'}`}>
      {status}
    </span>
  )
}
