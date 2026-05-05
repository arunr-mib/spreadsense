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
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col">
      {/* Top bar */}
      <header className="bg-[var(--bg-card)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-[var(--accent)] text-white flex items-center justify-center font-bold text-[15px] tracking-tight">
              S
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                SpreadSense
              </span>
              <span className="text-xs text-[var(--text-tertiary)] hidden sm:inline">
                AI-native financial spreading
              </span>
            </div>
          </div>
          <a
            href="https://github.com/arunr-mib/spreadsense"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hidden sm:inline-flex items-center gap-1"
          >
            View on GitHub
            <span aria-hidden>→</span>
          </a>
        </div>
      </header>

      {/* Main split */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-12 lg:py-20 grid lg:grid-cols-12 gap-10 lg:gap-16">
          {/* Left: marketing */}
          <section className="lg:col-span-7 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 mb-8">
              <span className="inline-flex items-center gap-1.5 bg-[var(--pass-bg)] text-[var(--pass)] text-[11px] font-semibold px-2 py-1 rounded-full uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--pass)]"></span>
                Live demo
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">
                v1.4 · May 2026
              </span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.05] mb-6">
              Spread a financial doc in{' '}
              <span className="text-[var(--accent)]">3 minutes</span>,
              <br className="hidden sm:inline" /> not 3 hours.
            </h1>

            <p className="text-lg text-[var(--text-secondary)] leading-relaxed mb-10 max-w-2xl">
              SpreadSense reads borrower financial filings end-to-end —
              statements, footnotes, MD&amp;A — and hands the analyst a
              confidence-coded spread, AI-written variance commentary, and a
              free-text Q&amp;A surface over the source document. Built on
              Claude, designed for commercial credit analysts at community and
              regional banks.
            </p>

            {/* Feature grid */}
            <div className="grid sm:grid-cols-2 gap-3 mb-10">
              <FeatureCard
                title="AI extraction with confidence"
                body="Claude pulls IS / BS / CF from a 150-page 10-K with per-field confidence scores. ~30s end to end. Validated on real DocuSign and Microsoft filings."
              />
              <FeatureCard
                title="Variance commentary"
                body="Two periods in, four credit-grade bullets out. DSO drift, interest coverage, quality of earnings — flagged in 12 seconds."
              />
              <FeatureCard
                title="Ask the Filing"
                body="Free-text Q&A grounded in the actual extracted text. Risk factors, debt maturity, MD&A — answered with section-level citations."
              />
              <FeatureCard
                title="Multiple ingestion paths"
                body="Upload PDF, fetch from SEC EDGAR by ticker, or pull a trial balance directly from QuickBooks. No more re-keying."
              />
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 pt-8 border-t border-[var(--border)]">
              <Stat value="~$1.28" label="AI cost per spread" />
              <Stat value="60–80×" label="Faster than manual" />
              <Stat value="23/33" label="Fields on DocuSign 10-K" />
              <Stat value="0" label="Hallucinations in validation" />
            </div>
          </section>

          {/* Right: login card */}
          <section className="lg:col-span-5 flex items-start lg:items-center">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-sm p-8 w-full max-w-md mx-auto lg:mx-0 lg:ml-auto">
              <h2 className="text-xl font-semibold tracking-tight mb-1">
                Sign in
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Use your analyst credentials to continue.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5"
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
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5"
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
                    className="w-full bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  />
                </div>
                {error && (
                  <div className="bg-[var(--breach-bg)] border border-rose-200 text-[var(--breach)] rounded-md px-3 py-2 text-sm">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[var(--accent)] text-white rounded-md py-2.5 text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              {/* Demo credentials helper */}
              <div className="mt-7 pt-6 border-t border-[var(--border)]">
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold mb-3">
                  Demo credentials
                </div>
                <div className="text-[12.5px] text-[var(--text-secondary)] space-y-1.5 font-[var(--font-mono)]">
                  <div>
                    <span className="text-[var(--text-tertiary)]">analyst</span>{' '}
                    smoke@test.com / Smoke1234!
                  </div>
                  <div>
                    <span className="text-[var(--text-tertiary)]">uat</span>{' '}
                    uat@test.com / Test1234!
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--bg-card)]">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--text-tertiary)]">
          <div>
            © 2026 SpreadSense · Built for commercial credit analysts
          </div>
          <div className="flex gap-3">
            <span>Claude Opus 4.5 · Sonnet 4.5</span>
            <span aria-hidden>·</span>
            <span>Vercel · Railway · Neon</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--border-strong)] transition-colors">
      <div className="font-semibold text-[13px] text-[var(--text-primary)] mb-1.5 tracking-tight">
        {title}
      </div>
      <div className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
        {body}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
        {value}
      </div>
      <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mt-0.5">
        {label}
      </div>
    </div>
  )
}
