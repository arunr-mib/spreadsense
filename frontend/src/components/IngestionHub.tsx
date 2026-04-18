import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { uploadDocument } from '../api/ingestion'
import type { ExtractionJob } from '../types'

interface Props {
  spreadId: number
  onJobReady: (job: ExtractionJob) => void
  onClose: () => void
}

export default function IngestionHub({ spreadId, onJobReady, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const mutation = useMutation({
    mutationFn: (file: File) => uploadDocument(spreadId, file),
    onSuccess: (job) => onJobReady(job),
  })

  const handleFile = (file: File) => mutation.mutate(file)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
         onClick={onClose}>
      <div className="bg-[var(--bg-card)] rounded-xl shadow-xl p-6 w-full max-w-lg"
           onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Import Financial Statements</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Upload a PDF, Word, or Excel financial statement. Claude AI will extract the figures.
        </p>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-[var(--accent)] bg-[var(--bg-page)]' : 'border-[var(--border)] hover:border-[var(--text-secondary)]'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef} type="file" className="hidden"
            accept=".pdf,.docx,.xlsx"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Drop file here or click to browse</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">PDF · Word (.docx) · Excel (.xlsx) — max 50 MB</p>
        </div>

        {mutation.isPending && (
          <div className="mt-4 text-center">
            <p className="text-sm text-[var(--accent)] animate-pulse">Extracting with Claude AI...</p>
          </div>
        )}
        {mutation.isError && (
          <p className="mt-3 text-sm text-red-500 text-center">Upload failed. Please try again.</p>
        )}

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
