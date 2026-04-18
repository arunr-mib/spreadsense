import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getNarrative, generateNarrative, saveNarrative, getNarrativeVersions } from '../api/narrative'
import { getAnalytics } from '../api/analytics'

interface Props {
  spreadId: number
}

export default function NarrativeSection({ spreadId }: Props) {
  const qc = useQueryClient()
  const editorRef = useRef<HTMLDivElement>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [viewingVersion, setViewingVersion] = useState<number | null>(null)

  // Check if any IS period exists — controls Generate button
  const { data: analytics } = useQuery({
    queryKey: ['analytics', spreadId],
    queryFn: () => getAnalytics(spreadId),
    staleTime: 30_000,
  })
  const hasISData = analytics?.periods.some(p =>
    p.ratios.ebitda_margin !== null || p.ratios.gross_margin !== null
  ) ?? false

  // Latest narrative
  const { data: latest, isLoading, isError } = useQuery({
    queryKey: ['narrative', spreadId],
    queryFn: () => getNarrative(spreadId),
    staleTime: 0,
    retry: (count, err: unknown) => {
      if ((err as { response?: { status?: number } })?.response?.status === 404) return false
      return count < 2
    },
  })

  // Version history
  const { data: versions = [] } = useQuery({
    queryKey: ['narrative-versions', spreadId],
    queryFn: () => getNarrativeVersions(spreadId),
    enabled: !!latest,
    staleTime: 0,
  })

  // Derived: content of the currently-viewed older version (null when viewing latest)
  const viewingContent = viewingVersion !== null
    ? (versions.find(ver => ver.version === viewingVersion)?.content ?? null)
    : null

  // Sort descending by version (API returns desc, but sort defensively)
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version)

  // Sync editor with latest content when not dirty and viewing latest
  useEffect(() => {
    if (editorRef.current && latest && viewingVersion === null && !isDirty) {
      editorRef.current.innerText = latest.content
    }
  }, [latest, viewingVersion, isDirty])

  const invalidateNarrative = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['narrative', spreadId] })
    qc.invalidateQueries({ queryKey: ['narrative-versions', spreadId] })
  }, [qc, spreadId])

  const generateMutation = useMutation({
    mutationFn: () => generateNarrative(spreadId),
    onSuccess: (data) => {
      invalidateNarrative()
      setIsDirty(false)
      setViewingVersion(null)
      if (editorRef.current) editorRef.current.innerText = data.content
    },
  })

  const saveMutation = useMutation({
    mutationFn: (content: string) => saveNarrative(spreadId, content),
    onSuccess: () => {
      invalidateNarrative()
      setIsDirty(false)
      setViewingVersion(null)
    },
  })

  const handleSave = useCallback(() => {
    if (!editorRef.current) return
    const content = editorRef.current.innerText.trim()
    if (content) saveMutation.mutate(content)
  }, [saveMutation])

  const handleRestore = () => {
    if (viewingContent === null) return
    saveMutation.mutate(viewingContent)
  }

  const handleGenerate = () => {
    if (isDirty) {
      if (!window.confirm(
        'Regenerate will replace current content. Your unsaved edits will be lost. Continue?'
      )) return
    }
    generateMutation.mutate()
  }

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  if (isLoading) {
    return (
      <div className="py-12 text-center text-[var(--text-secondary)]">Loading narrative...</div>
    )
  }

  const noNarrativeYet = !isLoading && (isError || !latest)

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {sortedVersions.length > 0 && (
            <select
              value={viewingVersion ?? ''}
              onChange={(e) => {
                const val = e.target.value
                setViewingVersion(val === '' ? null : Number(val))
              }}
              className="text-sm border border-[var(--border)] rounded-md px-2 py-1 bg-[var(--bg-card)] text-[var(--text-primary)]"
            >
              <option value="">Latest (v{latest?.version ?? '…'})</option>
              {sortedVersions.slice(1).map((v) => (
                <option key={v.id} value={v.version}>
                  v{v.version} — {v.created_by_name} · {new Date(v.created_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
          {isDirty && (
            <span className="text-xs text-[var(--near)]">● unsaved changes</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !hasISData}
            title={!hasISData ? 'Add at least one historical Income Statement period first' : ''}
            className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--bg-page)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generateMutation.isPending ? '⏳ Generating...' : '↺ Regenerate'}
          </button>
          {!noNarrativeYet && viewingVersion === null && (
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || !isDirty}
              className="px-3 py-1.5 text-sm rounded-lg bg-[var(--accent)] text-[var(--bg-page)] hover:opacity-90 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving...' : '💾 Save'}
            </button>
          )}
          {viewingVersion !== null && (
            <button
              onClick={handleRestore}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 text-sm rounded-lg bg-[var(--accent)] text-[var(--bg-page)] hover:opacity-90 disabled:opacity-50"
            >
              Restore this version
            </button>
          )}
        </div>
      </div>

      {/* Read-only banner for prior versions */}
      {viewingVersion !== null && (
        <div className="border border-[var(--near)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-card)]">
          📖 Viewing v{viewingVersion} — read-only. Click "Restore this version" to make it current.
        </div>
      )}

      {/* Generate CTA — shown when no narrative exists */}
      {noNarrativeYet && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-12 text-center">
          <p className="text-[var(--text-secondary)] mb-4">
            No narrative yet. Generate one from your spread data.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !hasISData}
            title={!hasISData ? 'Add at least one historical Income Statement period first' : ''}
            className="px-6 py-2.5 bg-[var(--accent)] text-[var(--bg-page)] rounded-lg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generateMutation.isPending ? '⏳ Generating narrative...' : '✦ Generate Narrative'}
          </button>
          {!hasISData && (
            <p className="text-xs text-[var(--text-secondary)] mt-2">
              Add at least one historical Income Statement period first
            </p>
          )}
        </div>
      )}

      {/* Editor — shown when narrative exists and viewing latest */}
      {!noNarrativeYet && viewingVersion === null && (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => setIsDirty(true)}
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-6 min-h-64 text-sm text-[var(--text-primary)] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--accent)] whitespace-pre-wrap"
          style={{ lineHeight: '1.75' }}
        />
      )}

      {/* Read-only viewer — shown when viewing a prior version */}
      {viewingVersion !== null && viewingContent !== null && (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-6 min-h-64 text-sm text-[var(--text-primary)] leading-relaxed opacity-80 whitespace-pre-wrap"
          style={{ lineHeight: '1.75' }}
        >
          {viewingContent}
        </div>
      )}

      <p className="text-xs text-[var(--text-secondary)]">
        Click to edit · Ctrl+S to save · Each save creates a new version
      </p>
    </div>
  )
}
