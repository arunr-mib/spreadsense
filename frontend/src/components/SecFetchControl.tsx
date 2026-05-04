// frontend/src/components/SecFetchControl.tsx
import { useState } from 'react'
import { fetchSecFiling } from '../api/secFetcher'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; filename: string; sizeBytes: number; pageCount: number }
  | { kind: 'error'; message: string }

export default function SecFetchControl() {
  const [ticker, setTicker] = useState('')
  const [form, setForm] = useState<'10-K' | '10-Q'>('10-K')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const isLoading = status.kind === 'loading'
  const canFetch = ticker.trim().length > 0 && !isLoading

  async function onFetch() {
    setStatus({ kind: 'loading' })
    try {
      const { blob, filename, pageCount } = await fetchSecFiling(ticker.trim(), form)
      triggerDownload(blob, filename)
      setStatus({ kind: 'success', filename, sizeBytes: blob.size, pageCount })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error — try again'
      setStatus({ kind: 'error', message })
    }
  }

  return (
    <div className="rounded-lg border border-indigo-300 border-l-4 border-l-indigo-500 bg-white p-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
        Fetch the doc from SEC.gov site
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-44 rounded border border-slate-300 px-2 py-1.5 text-sm uppercase placeholder:normal-case"
          placeholder="Ticker (e.g. msft)"
          value={ticker}
          disabled={isLoading}
          onChange={(e) => setTicker(e.target.value)}
        />
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          value={form}
          disabled={isLoading}
          onChange={(e) => setForm(e.target.value as '10-K' | '10-Q')}
        >
          <option value="10-K">10-K (annual)</option>
          <option value="10-Q">10-Q (quarterly)</option>
        </select>
        <button
          className="rounded bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white disabled:bg-indigo-300"
          disabled={!canFetch}
          onClick={onFetch}
        >
          {isLoading ? '⟳ Fetching…' : 'Fetch latest 10K/Q'}
        </button>
      </div>

      <div className="mt-2 text-xs text-slate-500">
        Downloads the most recent financial filing as a PDF file. Then upload it above.
      </div>

      {status.kind === 'loading' && (
        <div className="mt-3 text-sm text-indigo-700">
          Looking up filing on SEC.gov…
          <br />
          <span className="text-slate-500">
            Rendering PDF (this can take 10–30 seconds for a 200-page 10-K)
          </span>
        </div>
      )}

      {status.kind === 'success' && (
        <div className="mt-3 text-sm text-green-700">
          ✓ Downloaded <strong>{status.filename}</strong> ({formatBytes(status.sizeBytes)}, {status.pageCount} pages)
          <br />
          <span className="text-slate-500">Now click "Choose file" above to upload it.</span>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="mt-3 text-sm text-red-700">
          ✗ {status.message}
          <br />
          <span className="text-slate-500">
            Check the symbol or browse{' '}
            <a
              href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 underline"
            >
              SEC.gov
            </a>{' '}
            site directly.
          </span>
        </div>
      )}
    </div>
  )
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
