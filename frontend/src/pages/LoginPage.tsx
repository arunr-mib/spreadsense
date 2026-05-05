import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { login } from '../api/auth'
import { useAuthStore } from '../store/auth'
import AnimatedNumber from '../components/landing/AnimatedNumber'
import Reveal from '../components/landing/Reveal'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.login)

  // Sticky-nav background flips solid once the user scrolls past the hero.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  function scrollToSignIn() {
    document.getElementById('sign-in')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen text-slate-900 bg-white antialiased overflow-x-hidden">
      {/* ─── STICKY NAV ─── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/90 backdrop-blur-md border-b border-slate-200'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-tight">
              S
            </div>
            <span className="text-[15px] font-semibold tracking-tight">
              SpreadSense
            </span>
          </div>
          <div className="flex items-center gap-5">
            <a
              href="#how-it-works"
              className="hidden sm:inline text-sm text-slate-600 hover:text-slate-900 font-medium"
            >
              How it works
            </a>
            <a
              href="#features"
              className="hidden sm:inline text-sm text-slate-600 hover:text-slate-900 font-medium"
            >
              Features
            </a>
            <a
              href="https://github.com/arunr-mib/spreadsense"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline text-sm text-slate-600 hover:text-slate-900 font-medium"
            >
              GitHub
            </a>
            <button
              type="button"
              onClick={scrollToSignIn}
              className="text-sm font-semibold bg-slate-900 text-white px-4 py-2 rounded-md hover:bg-slate-800 transition-colors"
            >
              Sign in
            </button>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden">
        {/* Soft radial gradient backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-50 via-white to-white"
        />
        <div
          aria-hidden
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] -z-10 opacity-40 blur-3xl bg-gradient-radial from-blue-200 via-blue-50 to-transparent"
          style={{
            background:
              'radial-gradient(circle, rgba(147,197,253,0.4) 0%, rgba(239,246,255,0.2) 35%, transparent 70%)',
          }}
        />

        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="max-w-4xl">
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-soft"></span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                Live demo · v1.4 · May 2026
              </span>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-[-0.02em] leading-[1.02] mb-8 max-w-5xl">
              Spread a financial doc
              <br />
              <span className="text-slate-400">in 3 minutes,</span>
              <br />
              <span className="text-slate-900">not 3 hours.</span>
            </h1>
          </Reveal>

          <Reveal delay={240}>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed mb-10 max-w-2xl">
              SpreadSense reads borrower financial filings end-to-end —
              statements, footnotes, MD&amp;A — and hands the analyst a
              confidence-coded spread, AI-written variance commentary, and a
              free-text Q&amp;A surface over the source document. Built on
              Claude, designed for commercial credit analysts.
            </p>
          </Reveal>

          <Reveal delay={360} className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={scrollToSignIn}
              className="group inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-md text-[15px] font-semibold hover:bg-slate-800 transition-all shadow-sm hover:shadow-md"
            >
              Try the live demo
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 bg-white text-slate-900 px-6 py-3 rounded-md text-[15px] font-semibold border border-slate-300 hover:border-slate-400 hover:bg-slate-50 transition-colors"
            >
              See how it works
            </a>
          </Reveal>

          {/* Hero visual: animated pipeline */}
          <Reveal delay={500} className="mt-16 lg:mt-20">
            <PipelineVisual />
          </Reveal>
        </div>
      </section>

      {/* ─── STATS STRIP ─── */}
      <section className="bg-slate-900 text-white py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300 mb-3">
              Validated in production
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-12 max-w-3xl">
              Real filings. Real numbers. Zero hallucinations.
            </h2>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6">
            <Reveal delay={0}>
              <StatBlock
                value={
                  <>
                    <span className="text-slate-400">~$</span>
                    <AnimatedNumber value={1.28} format={(n) => n.toFixed(2)} />
                  </>
                }
                label="AI cost per spread"
                hint="vs. ~$200 of analyst time"
              />
            </Reveal>
            <Reveal delay={120}>
              <StatBlock
                value={
                  <>
                    <AnimatedNumber value={70} format={(n) => Math.round(n).toString()} />
                    <span className="text-slate-400">×</span>
                  </>
                }
                label="Faster than manual"
                hint="3 minutes vs. 3+ hours"
              />
            </Reveal>
            <Reveal delay={240}>
              <StatBlock
                value={
                  <>
                    <AnimatedNumber value={23} format={(n) => Math.round(n).toString()} />
                    <span className="text-slate-400">/33</span>
                  </>
                }
                label="Fields on DocuSign 10-K"
                hint="HIGH confidence on 18 of 23"
              />
            </Reveal>
            <Reveal delay={360}>
              <StatBlock
                value={
                  <AnimatedNumber value={0} format={(n) => Math.round(n).toString()} />
                }
                label="Hallucinations to date"
                hint="Refusal-over-fabrication prompt design"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-24 lg:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="max-w-3xl mb-16">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 mb-3">
              How it works
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
              Two deterministic stages bracketing one bounded LLM call.
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Most "AI auto-spreading" pipelines are an unbounded LLM with
              hopes attached. Ours is a tight pipeline where the language
              model has one job — read pre-located financial-statement text
              — and Python handles everything else.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            <Reveal delay={0}>
              <StepCard
                step="01"
                title="Source"
                desc="Upload a PDF, fetch a 10-K from SEC EDGAR by ticker, or pull a trial balance directly from QuickBooks."
                tag="3 paths"
              />
            </Reveal>
            <Reveal delay={120}>
              <StepCard
                step="02"
                title="Smart slice"
                desc="A regex locates the financial statements section in a 400K-char filing and trims to a 100K-char window. ~75% token-cost cut."
                tag="Deterministic"
              />
            </Reveal>
            <Reveal delay={240}>
              <StepCard
                step="03"
                title="Claude extraction"
                desc="Three focused calls — IS, BS, CF — each emit structured field values with confidence scores. Refuses to invent missing fields."
                tag="Claude Opus 4.5"
              />
            </Reveal>
            <Reveal delay={360}>
              <StepCard
                step="04"
                title="Reviewed spread"
                desc="LOW-confidence rows route to the analyst's review queue first. One click confirms; ratios + subtotals compute deterministically."
                tag="Human-in-loop"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── FEATURE BLOCKS ─── */}
      <section id="features" className="py-24 lg:py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="max-w-3xl mb-16">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 mb-3">
              What's inside
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
              Beyond the spread.
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              QuikSpread reads tables. SpreadSense reads prose. Once the
              spread is built, three more AI surfaces pick up where the
              numbers stop telling the story.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-4">
            <Reveal delay={0}>
              <FeatureBlock
                kicker="AI commentary"
                title="Variance Commentary"
                desc="Two periods in, four to six credit-grade bullets out. DSO drift, interest coverage, quality of earnings — categorized and ending with a forward-looking watchpoint. ~12 seconds."
                example={
                  <>
                    <em>"AR rose 18.5% on falling revenue; DSO 58→76 days,
                    suggesting collection issues or aggressive recognition."</em>
                  </>
                }
              />
            </Reveal>
            <Reveal delay={120}>
              <FeatureBlock
                kicker="Q&A surface"
                title="Ask the Filing"
                desc="Free-text Q&A grounded in the actual extracted text. Risk factors, debt maturity, MD&A liquidity, related-party transactions — answered with section-level citations."
                example={
                  <>
                    <em>"$750M revolving facility maturing May 2030 with no
                    outstanding borrowings. Source: Note 8 — Debt."</em>
                  </>
                }
              />
            </Reveal>
            <Reveal delay={240}>
              <FeatureBlock
                kicker="Direct ingestion"
                title="QuickBooks · SEC · PDF"
                desc="Three ingestion paths instead of one. Public co? Type the ticker. SMB? Connect QuickBooks. Custom audit? Drop the PDF. The pipeline handles each."
                example={
                  <>
                    <em>"msft + 10-K → 60s later your spread has a real
                    Microsoft annual report extracted into the RMA template."</em>
                  </>
                }
              />
            </Reveal>
            <Reveal delay={360}>
              <FeatureBlock
                kicker="Workflow"
                title="Maker-checker + audit trail"
                desc="JWT auth, three roles (analyst / sr_analyst / admin), forward + Reopen state machine, audit-logged transitions. Examiner-ready out of the box."
                example={
                  <>
                    <em>"Submit for review → reviewer sees queue → mark
                    Reviewed or Reopen for changes. Each transition logged."</em>
                  </>
                }
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── ARCHITECTURE SPOTLIGHT (DARK) ─── */}
      <section className="py-24 lg:py-32 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6">
          <Reveal className="max-w-3xl mb-12">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300 mb-3">
              Architecture
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
              The LLM has one job. We do the rest.
            </h2>
            <p className="text-lg text-slate-300 leading-relaxed">
              Bounding the AI's scope is how we get reliable financial
              extraction. Smart slicing locates the statements before
              Claude sees them. Confidence scores route attention. Subtotals
              and ratios are computed in Python, never by AI. Hallucination
              rate, empirically: zero.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 md:p-10">
              <div className="grid md:grid-cols-5 gap-4">
                {[
                  { label: 'Source', sub: 'PDF / SEC / QBO', kind: 'det' },
                  { label: 'PyMuPDF', sub: 'Text extract', kind: 'det' },
                  { label: 'Regex slice', sub: '100K-char window', kind: 'det' },
                  { label: 'Claude × 3', sub: 'IS · BS · CF', kind: 'ai' },
                  { label: 'Spread DB', sub: 'Postgres', kind: 'det' },
                ].map((stage, idx) => (
                  <div
                    key={stage.label}
                    className="relative flex flex-col items-center text-center"
                  >
                    <div
                      className={`w-full rounded-lg border px-4 py-5 ${
                        stage.kind === 'ai'
                          ? 'bg-blue-500/10 border-blue-400/40'
                          : 'bg-slate-700/40 border-slate-600'
                      }`}
                    >
                      <div
                        className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${
                          stage.kind === 'ai' ? 'text-blue-300' : 'text-slate-400'
                        }`}
                      >
                        {stage.kind === 'ai' ? 'AI' : 'Deterministic'}
                      </div>
                      <div className="font-semibold text-sm md:text-[15px] mb-1">
                        {stage.label}
                      </div>
                      <div className="text-[12px] text-slate-400">{stage.sub}</div>
                    </div>
                    {idx < 4 && (
                      <span
                        aria-hidden
                        className="hidden md:block absolute top-1/2 -translate-y-1/2 -right-2.5 text-slate-600"
                      >
                        →
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-8 border-t border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <ArchStat
                  label="Per-spread cost"
                  value="~$1.28"
                  body="3 Claude Opus calls · ~78K input tokens"
                />
                <ArchStat
                  label="End-to-end time"
                  value="~30s"
                  body="Parse + slice + 3 calls + persist"
                />
                <ArchStat
                  label="Confidence routing"
                  value="3 tiers"
                  body="HIGH ≥ 0.85 · MED ≥ 0.60 · LOW < 0.60"
                />
                <ArchStat
                  label="Hallucinations"
                  value="0"
                  body="Refusal-over-fabrication prompt"
                />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── SIGN-IN CTA ─── */}
      <section
        id="sign-in"
        className="py-24 lg:py-32 bg-white scroll-mt-20"
      >
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <Reveal>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 mb-3">
              Try it now
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
              Sign in. Spread a 10-K. Watch the AI explain the variances.
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              Two demo accounts pre-loaded with DocuSign and Microsoft data.
              Open the spread, switch to the KPIs tab, click{' '}
              <span className="font-semibold text-slate-900">Explain changes</span>{' '}
              — about 12 seconds later you have credit-committee-ready bullets.
            </p>
            <ul className="space-y-3 text-[15px] text-slate-700">
              {[
                'AI variance commentary across 6 categories',
                'Ask the Filing on the actual 10-K text',
                'Pull QuickBooks · or fetch SEC filings · or upload PDF',
                'Excel export, dual-review workflow, audit trail',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-blue-700 shrink-0"></span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={150}>
            <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-7 lg:p-8">
              <h3 className="text-xl font-semibold tracking-tight mb-1">
                Sign in
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Use the demo credentials below.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-[13px] font-medium text-slate-700 mb-1.5"
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
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                <div>
                  <label
                    htmlFor="password"
                    className="block text-[13px] font-medium text-slate-700 mb-1.5"
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
                    className="w-full bg-white border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
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
                  className="w-full bg-slate-900 text-white rounded-md py-2.5 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Signing in…' : 'Sign in to demo'}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
                  Demo credentials
                </div>
                <div className="text-[12.5px] text-slate-700 space-y-1.5 font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('smoke@test.com')
                      setPassword('Smoke1234!')
                    }}
                    className="block w-full text-left hover:bg-slate-50 px-2 py-1 rounded -mx-2 transition-colors"
                  >
                    <span className="text-slate-400">analyst</span>{' '}
                    smoke@test.com / Smoke1234!
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('uat@test.com')
                      setPassword('Test1234!')
                    }}
                    className="block w-full text-left hover:bg-slate-50 px-2 py-1 rounded -mx-2 transition-colors"
                  >
                    <span className="text-slate-400">uat</span>{' '}
                    uat@test.com / Test1234!
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8 grid sm:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-[11px]">
                S
              </div>
              <span className="font-semibold tracking-tight">SpreadSense</span>
            </div>
            <p className="text-slate-500 text-[13px] leading-relaxed">
              AI-native financial spreading for commercial credit analysts.
            </p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
              Stack
            </div>
            <ul className="text-slate-600 space-y-1 text-[13px]">
              <li>Claude Opus 4.5 · Sonnet 4.5</li>
              <li>FastAPI · Postgres · React</li>
              <li>Vercel · Railway · Neon</li>
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
              Links
            </div>
            <ul className="text-slate-600 space-y-1 text-[13px]">
              <li>
                <a
                  href="https://github.com/arunr-mib/spreadsense"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900"
                >
                  GitHub →
                </a>
              </li>
              <li>
                <a
                  href="https://spreadsense-production.up.railway.app/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900"
                >
                  API docs →
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-6 py-4 text-xs text-slate-400 flex flex-col sm:flex-row justify-between gap-2">
            <span>© 2026 SpreadSense · Built for commercial credit analysts</span>
            <span>v1.4 · May 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ─────────────── Sub-components ─────────────── */

function PipelineVisual() {
  // A static-but-styled visual evoking the architecture, with subtle
  // staggered shimmer on the Claude card to suggest "in motion".
  return (
    <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 md:p-10 shadow-2xl overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(96,165,250,0.4), transparent 50%), radial-gradient(circle at 80% 80%, rgba(168,85,247,0.25), transparent 50%)',
        }}
      />
      <div className="relative grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <PipeStage label="PDF" sub="Borrower's 10-K" />
        <PipeStage label="Text" sub="PyMuPDF" />
        <PipeStage label="100K slice" sub="Regex locate" />
        <PipeStage
          label="Claude × 3"
          sub="IS · BS · CF"
          highlight
        />
        <PipeStage label="Spread" sub="Confidence-coded" />
      </div>
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-[12px] relative">
        <div className="text-slate-300">
          <div className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold mb-1">
            Per spread
          </div>
          <div className="text-white font-semibold">~$1.28 · ~30s</div>
        </div>
        <div className="text-slate-300">
          <div className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold mb-1">
            Tokens in / out
          </div>
          <div className="text-white font-semibold">78K / 1.5K</div>
        </div>
        <div className="text-slate-300">
          <div className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold mb-1">
            Validated on
          </div>
          <div className="text-white font-semibold">DocuSign · MSFT · AAPL</div>
        </div>
        <div className="text-slate-300">
          <div className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold mb-1">
            Hallucinations
          </div>
          <div className="text-emerald-300 font-semibold">0 measured</div>
        </div>
      </div>
    </div>
  )
}

function PipeStage({
  label,
  sub,
  highlight = false,
}: {
  label: string
  sub: string
  highlight?: boolean
}) {
  return (
    <div
      className={`relative rounded-lg p-3 md:p-4 border ${
        highlight
          ? 'bg-blue-500/15 border-blue-400/40 ring-1 ring-blue-400/30 animate-shimmer'
          : 'bg-slate-700/40 border-slate-600/60'
      }`}
    >
      <div className="text-white font-semibold text-sm md:text-[15px]">
        {label}
      </div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  )
}

function StatBlock({
  value,
  label,
  hint,
}: {
  value: React.ReactNode
  label: string
  hint?: string
}) {
  return (
    <div>
      <div className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-wider text-blue-300 font-semibold">
        {label}
      </div>
      {hint && (
        <div className="mt-1 text-[12.5px] text-slate-400">{hint}</div>
      )}
    </div>
  )
}

function StepCard({
  step,
  title,
  desc,
  tag,
}: {
  step: string
  title: string
  desc: string
  tag: string
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 h-full hover:border-slate-300 hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Step {step}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700">
          {tag}
        </span>
      </div>
      <div className="font-semibold text-lg text-slate-900 mb-2 tracking-tight">
        {title}
      </div>
      <div className="text-[14px] text-slate-600 leading-relaxed">{desc}</div>
    </div>
  )
}

function FeatureBlock({
  kicker,
  title,
  desc,
  example,
}: {
  kicker: string
  title: string
  desc: string
  example: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-7 h-full hover:shadow-md hover:border-slate-300 transition-all">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 mb-2">
        {kicker}
      </div>
      <div className="font-semibold text-xl tracking-tight text-slate-900 mb-3">
        {title}
      </div>
      <div className="text-[14.5px] text-slate-600 leading-relaxed mb-4">
        {desc}
      </div>
      <div className="border-l-2 border-blue-500 pl-4 py-1 text-[13px] text-slate-700 bg-blue-50/40 rounded-r">
        {example}
      </div>
    </div>
  )
}

function ArchStat({
  label,
  value,
  body,
}: {
  label: string
  value: string
  body: string
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">
        {value}
      </div>
      <div className="text-[12px] text-slate-400 mt-1 leading-relaxed">
        {body}
      </div>
    </div>
  )
}
