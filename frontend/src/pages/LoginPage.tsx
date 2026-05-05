import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { login } from '../api/auth'
import { useAuthStore } from '../store/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.login)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const user = await login(email, password)
      setAuth(user)
      const dest =
        user.role === 'sr_credit_analyst' || user.role === 'admin'
          ? '/dashboard'
          : '/'
      navigate(dest)
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
              S
            </div>
            <span className="text-lg font-semibold text-slate-900">
              SpreadSense
            </span>
            <span className="text-xs text-slate-400 ml-2 hidden sm:inline">
              · AI-native financial spreading
            </span>
          </div>
          <a
            href="https://github.com/arunr-mib/spreadsense"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-slate-700 hidden sm:inline"
          >
            GitHub →
          </a>
        </div>
      </header>

      {/* Main split */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full px-6 py-8 lg:py-16 gap-8 lg:gap-16">
        {/* Left: marketing */}
        <div className="lg:w-3/5 flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide">
              Live demo
            </span>
            <span className="text-xs text-slate-500">
              v1.4 · May 2026
            </span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-4">
            Spread a 10-K in{' '}
            <span className="text-indigo-600">3 minutes</span>,
            <br className="hidden sm:inline" />
            not 3 hours.
          </h1>

          <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-2xl">
            SpreadSense reads borrower financial filings end-to-end —
            statements, footnotes, MD&amp;A — and hands the analyst a
            confidence-coded spread, AI-written variance commentary, and a
            free-text Q&amp;A surface over the source document. Built on
            Claude, designed for commercial credit analysts at community and
            regional banks.
          </p>

          {/* Feature grid */}
          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            <FeatureCard
              icon="📄"
              title="AI extraction with confidence"
              body="Claude pulls IS / BS / CF from a 150-page 10-K with per-field confidence scores. ~30 sec end-to-end. Validated on real DocuSign and Microsoft filings."
            />
            <FeatureCard
              icon="✨"
              title="Variance commentary"
              body="Two periods in, four credit-grade bullets out. DSO drift, interest coverage, quality of earnings — flagged in 12 seconds."
            />
            <FeatureCard
              icon="🔍"
              title="Ask the Filing"
              body="Free-text Q&A grounded in the actual extracted text. Risk factors, debt maturity, MD&A — answered with section-level citations."
            />
            <FeatureCard
              icon="🔗"
              title="Multiple ingestion paths"
              body="Upload PDF, fetch from SEC EDGAR by ticker, or pull a trial balance directly from QuickBooks. No more re-keying."
            />
          </div>

          {/* Stats strip */}
          <div className="flex flex-wrap gap-x-8 gap-y-3 pt-6 border-t border-slate-200">
            <Stat value="~$1.28" label="AI cost per spread" />
            <Stat value="60–80×" label="Faster than manual" />
            <Stat value="23/33" label="Fields extracted on DocuSign 10-K" />
            <Stat value="0" label="Hallucinations in validation" />
          </div>
        </div>

        {/* Right: login card */}
        <div className="lg:w-2/5 flex items-start lg:items-center">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 w-full max-w-md">
            <h2 className="text-xl font-semibold text-slate-900 mb-1">
              Sign in
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Use your analyst credentials to continue.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700 mb-1"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-md px-3 py-2 text-sm">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            {/* Demo credentials helper */}
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
                Demo credentials
              </div>
              <div className="text-xs text-slate-600 space-y-1 font-mono">
                <div>
                  <span className="text-slate-400">analyst:</span>{' '}
                  smoke@test.com / Smoke1234!
                </div>
                <div>
                  <span className="text-slate-400">uat:</span> uat@test.com /
                  Test1234!
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            © 2026 SpreadSense · Built for commercial credit analysts
          </div>
          <div className="flex gap-4">
            <span>Claude Opus 4.5 · Sonnet 4.5</span>
            <span className="hidden sm:inline">·</span>
            <span>Vercel · Railway · Neon</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: string
  title: string
  body: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold text-sm text-slate-900 mb-1">{title}</div>
      <div className="text-xs text-slate-600 leading-relaxed">{body}</div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">
        {label}
      </div>
    </div>
  )
}
