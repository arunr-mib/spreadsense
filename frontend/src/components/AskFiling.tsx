import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { askFiling, type AskResponse } from '../api/askFiling'

interface Props {
  spreadId: number
}

const SUGGESTED_QUESTIONS = [
  'What are the top 3 risk factors?',
  'Summarize the debt maturity schedule.',
  'Are there any material related-party transactions?',
  'What does management say about liquidity in the MD&A?',
]

export default function AskFiling({ spreadId }: Props) {
  const [question, setQuestion] = useState('')
  const [latest, setLatest] = useState<AskResponse | null>(null)

  const mutation = useMutation({
    mutationFn: (q: string) => askFiling(spreadId, q),
    onSuccess: (data) => setLatest(data),
  })

  function submit(q: string) {
    const trimmed = q.trim()
    if (trimmed.length < 3) return
    setQuestion(trimmed)
    mutation.mutate(trimmed)
  }

  const errorMessage =
    (mutation.error as { response?: { data?: { detail?: string } } } | null)
      ?.response?.data?.detail ??
    (mutation.error ? 'Question failed — try again.' : null)

  return (
    <div className="bg-white border border-purple-200 rounded-lg p-5 mb-4 shadow-sm">
      <div className="mb-3">
        <div className="text-xs uppercase tracking-wider text-purple-700 font-semibold">
          Ask the Filing
        </div>
        <div className="text-sm text-slate-500 mt-0.5">
          Free-text Q&amp;A grounded in this borrower's most recent uploaded
          document. Footnotes, MD&amp;A, risk factors — anything in the source.
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !mutation.isPending) submit(question)
          }}
          placeholder="e.g. What are the top 3 risk factors?"
          disabled={mutation.isPending}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          type="button"
          onClick={() => submit(question)}
          disabled={mutation.isPending || question.trim().length < 3}
          className="px-4 py-2 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed"
        >
          {mutation.isPending ? '⟳ Thinking…' : 'Ask'}
        </button>
      </div>

      {!latest && !mutation.isPending && !errorMessage && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submit(q)}
              className="text-xs px-3 py-1.5 rounded-full border border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {errorMessage && !mutation.isPending && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
          ✗ {errorMessage}
        </div>
      )}

      {latest && !mutation.isPending && (
        <div className="bg-slate-50 border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500 mb-2">
            From <span className="font-medium text-slate-700">{latest.filename}</span>
            {' · '}
            {new Date(latest.answered_at).toLocaleTimeString()}
          </div>
          <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
            {latest.answer}
          </div>
          {latest.source_hint && (
            <div className="mt-3 text-xs text-purple-700 font-medium">
              📍 {latest.source_hint}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setLatest(null)
                setQuestion('')
              }}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Ask another question
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
