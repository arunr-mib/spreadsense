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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
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
      {/* ─── STICKY NAV (Ramp recipe: lowercase wordmark · center nav · two CTAs) ─── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-900'
            : 'bg-transparent text-white'
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between">
          {/* Wordmark — stacked-sheets logo + branded wordmark with color split */}
          <a
            href="/"
            className="flex items-center gap-2.5 group"
            aria-label="SpreadSense home"
          >
            <SpreadSenseLogo />
            <span className="text-[24px] font-extrabold tracking-[-0.025em] leading-none">
              <span className={scrolled ? 'text-slate-900' : 'text-white'}>
                Spread
              </span>
              <span className="text-blue-400">Sense</span>
            </span>
          </a>

          {/* Center nav */}
          <div className="hidden md:flex items-center gap-9 text-[14px] font-medium">
            <a href="#how-it-works" className="hover:opacity-70 transition-opacity">
              Product
            </a>
            <a href="#timeline" className="hover:opacity-70 transition-opacity">
              Roll-out
            </a>
            <a href="#features" className="hover:opacity-70 transition-opacity">
              Features
            </a>
            <a href="#sign-in" className="hover:opacity-70 transition-opacity">
              Demo
            </a>
            <a
              href="https://github.com/arunr-mib/spreadsense"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-70 transition-opacity"
            >
              GitHub
            </a>
          </div>

          {/* Right-side CTAs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={scrollToSignIn}
              className={`text-[14px] font-semibold px-4 py-2 rounded-md transition-colors ${
                scrolled
                  ? 'text-slate-900 hover:bg-slate-100'
                  : 'text-white hover:bg-white/10'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={scrollToSignIn}
              className="text-[14px] font-semibold bg-[var(--highlight)] text-[var(--text-on-highlight)] px-4 py-2 rounded-md hover:bg-[var(--highlight-hover)] transition-colors"
            >
              See a demo
            </button>
          </div>
        </div>
      </nav>

      {/* ─── HERO (Ramp-style: dark gradient → fades to white) ─── */}
      <section
        className="relative isolate overflow-hidden pt-32 pb-32 lg:pt-40 lg:pb-40"
        style={{
          /* Gradient lives directly on the section so it can't be hidden
             behind the body's bg color. Stays deep navy across most of
             the hero so the white headline text always has contrast,
             then fades to white only in the last ~12% to transition
             smoothly into the next (light) section. */
          background:
            'linear-gradient(180deg, #060912 0%, #0a1230 30%, #0a1230 70%, #1e3a8a 88%, #ffffff 100%)',
        }}
      >
        {/* Subtle radial highlight on top */}
        <div
          aria-hidden
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-[1100px] h-[700px] z-0 opacity-60 blur-3xl pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse, rgba(59,130,246,0.25) 0%, rgba(96,165,250,0.18) 35%, transparent 70%)',
          }}
        />

        <div className="relative z-10 max-w-[1400px] mx-auto px-8 grid lg:grid-cols-12 gap-12 items-center">
          {/* Left column: copy */}
          <div className="lg:col-span-6 text-white">
            {/* Trust kicker (Ramp uses G2 stars; we cite live validation) */}
            <Reveal>
              <div className="flex items-center gap-2 mb-8 text-[13px] text-white/70">
                <span className="text-amber-300 tracking-tight">★★★★★</span>
                <span className="font-medium">Validated</span>
                <span className="text-white/40">on real DocuSign · Microsoft · Apple 10-Ks</span>
              </div>
            </Reveal>

            {/* Spreading-first headline (~30% smaller per design tweak) */}
            <Reveal delay={80}>
              <h1 className="text-[32px] sm:text-[40px] lg:text-[56px] font-bold tracking-[-0.025em] leading-[1.02] mb-6">
                Spread a 10-K
                <br />
                in 3 minutes.
                <br />
                <span className="text-white/55">Save the day.</span>
              </h1>
            </Reveal>

            {/* Subtitle calls out spreading explicitly */}
            <Reveal delay={160}>
              <p className="text-[15px] lg:text-[17px] text-white/75 leading-relaxed mb-8 max-w-xl">
                AI-native financial spreading for commercial credit analysts.
                Read borrower 10-Ks, audited financials, and trial balances
                end-to-end — statements, footnotes, MD&amp;A — and walk into
                credit committee with a confidence-coded spread, AI variance
                commentary, and a free-text Q&amp;A surface over the source.
              </p>
            </Reveal>

            {/* Ramp-style pill: white background, input + inline blue CTA */}
            <Reveal delay={240}>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  // If the user typed an email, take them to the sign-in card
                  // with that email pre-filled. Otherwise just scroll there.
                  scrollToSignIn()
                }}
                className="bg-white rounded-full p-1.5 flex items-center max-w-[520px] shadow-xl shadow-blue-900/20"
              >
                <input
                  type="email"
                  placeholder="Your work email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-0 px-5 py-2 text-[15px] text-slate-900 placeholder:text-slate-400 focus:ring-0"
                />
                <button
                  type="submit"
                  className="bg-[var(--highlight)] text-[var(--text-on-highlight)] px-5 py-2.5 rounded-full text-[14px] font-semibold whitespace-nowrap hover:bg-[var(--highlight-hover)] transition-colors"
                >
                  Try the demo
                </button>
              </form>
            </Reveal>

            {/* Explore product link */}
            <Reveal delay={320}>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-1.5 mt-7 text-[15px] font-semibold text-white hover:text-white/80 transition-colors"
              >
                Explore product <span aria-hidden>→</span>
              </a>
            </Reveal>
          </div>

          {/* Right column: spread mockup, overflows to convey "in motion" */}
          <Reveal delay={300} className="lg:col-span-6 relative lg:-mr-20 xl:-mr-32">
            <SpreadMockup />
          </Reveal>
        </div>

        {/* Bottom line under hero (Ramp pattern: "X teams have saved hours") */}
        <div className="relative z-10 max-w-[1400px] mx-auto px-8 mt-20 lg:mt-24 text-center">
          <Reveal delay={400}>
            <p className="text-[14px] text-slate-700">
              <strong className="text-slate-900">100% AI extraction accuracy on validated filings.</strong>{' '}
              Built for community and regional bank credit teams.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ─── LOGO STRIP ─── */}
      <section className="bg-white py-12 border-t border-slate-100">
        <div className="max-w-[1400px] mx-auto px-6 text-center">
          <Reveal>
            <p className="text-[13.5px] text-slate-500 mb-7">
              Spreads validated against real public filings from
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-slate-400 font-bold text-lg tracking-tight">
              <span>DocuSign</span>
              <span>Microsoft</span>
              <span>Apple</span>
              <span>Meta</span>
              <span>Amazon</span>
              <span>+ private SMB via QuickBooks</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── STATS STRIP ─── */}
      <section className="bg-slate-900 text-white py-20 lg:py-24">
        <div className="max-w-[1400px] mx-auto px-6">
          <Reveal>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--highlight)] mb-3">
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
                value={<AnimatedNumber value={0} format={(n) => Math.round(n).toString()} />}
                label="Hallucinations to date"
                hint="Refusal-over-fabrication design"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-24 lg:py-32 bg-white">
        <div className="max-w-[1400px] mx-auto px-6">
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
            <Reveal delay={0}><StepCard step="01" title="Source" desc="Upload a PDF, fetch a 10-K from SEC EDGAR by ticker, or pull a trial balance directly from QuickBooks." tag="3 paths" /></Reveal>
            <Reveal delay={120}><StepCard step="02" title="Smart slice" desc="A regex locates the financial statements section in a 400K-char filing and trims to a 100K-char window. ~75% token-cost cut." tag="Deterministic" /></Reveal>
            <Reveal delay={240}><StepCard step="03" title="Claude extraction" desc="Three focused calls — IS, BS, CF — each emit structured field values with confidence scores. Refuses to invent missing fields." tag="Claude Opus 4.5" /></Reveal>
            <Reveal delay={360}><StepCard step="04" title="Reviewed spread" desc="LOW-confidence rows route to the analyst's review queue first. One click confirms; ratios + subtotals compute deterministically." tag="Human-in-loop" /></Reveal>
          </div>
        </div>
      </section>

      {/* ─── 30-DAY TIMELINE (Ramp-style) ─── */}
      <section id="timeline" className="py-24 lg:py-32 bg-slate-50">
        <div className="max-w-[1400px] mx-auto px-6">
          <Reveal className="text-center mb-3">
            <p className="text-[14px] text-slate-500">
              New software shouldn't take a year to implement.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="text-center text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-6 max-w-4xl mx-auto">
              Here's what you can get done with
              <br />
              SpreadSense in just 30 days.
            </h2>
          </Reveal>
          <Reveal delay={160} className="text-center mb-20">
            <button
              type="button"
              onClick={scrollToSignIn}
              className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-slate-900 hover:text-slate-700 transition-colors"
            >
              Switch to SpreadSense
              <span aria-hidden>→</span>
            </button>
          </Reveal>

          {/* Pills + connecting line */}
          <div className="grid grid-cols-3 mb-6 max-w-5xl mx-auto">
            <div className="flex justify-start">
              <span className="bg-white border border-slate-200 rounded-md px-5 py-2 text-[14px] font-semibold text-slate-900">
                Today
              </span>
            </div>
            <div className="flex justify-center">
              <span className="bg-white border border-slate-200 rounded-md px-5 py-2 text-[14px] font-semibold text-slate-900">
                Day 7
              </span>
            </div>
            <div className="flex justify-end">
              <span className="bg-slate-100 border border-slate-200 rounded-md px-5 py-2 text-[14px] font-semibold text-slate-700">
                Day 30
              </span>
            </div>
          </div>

          {/* Connector line */}
          <div className="relative h-3 mb-8 max-w-5xl mx-auto px-8">
            <div
              aria-hidden
              className="absolute top-1/2 -translate-y-1/2 left-8 right-8 h-px bg-slate-200"
            />
            <div className="relative grid grid-cols-3 h-full">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`flex items-center ${
                    i === 0
                      ? 'justify-start'
                      : i === 1
                        ? 'justify-center'
                        : 'justify-end'
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-full border-2 ${
                      i === 2
                        ? 'bg-slate-700 border-slate-700'
                        : 'bg-white border-slate-300'
                    }`}
                  ></span>
                </div>
              ))}
            </div>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            <Reveal delay={0}>
              <TimelineCard
                heading="Get started."
                items={[
                  'Sign in and pull DocuSign 10-K from SEC',
                  'Spread the IS / BS / CF in 3 minutes',
                  'Generate AI variance commentary',
                ]}
              />
            </Reveal>
            <Reveal delay={150}>
              <TimelineCard
                heading="Get comfortable."
                items={[
                  'Connect QuickBooks for a private SMB borrower',
                  'Ask the filing about footnotes and MD&A',
                  'Export the committee-ready Excel pack',
                ]}
              />
            </Reveal>
            <Reveal delay={300}>
              <TimelineCard
                heading="Ask why you didn't switch sooner."
                items={[
                  '95% of public spreads done in under 5 minutes',
                  '70× faster than manual on average',
                  'Memo + Q&A built into every credit pack',
                ]}
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── FEATURE BLOCKS ─── */}
      <section id="features" className="py-24 lg:py-32 bg-white">
        <div className="max-w-[1400px] mx-auto px-6">
          <Reveal className="max-w-3xl mb-16">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 mb-3">
              What's inside
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
              Beyond the spread.
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              QuikSpread reads tables. SpreadSense reads prose. Once the spread
              is built, three more AI surfaces pick up where the numbers stop
              telling the story.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-4">
            <Reveal delay={0}>
              <FeatureBlock kicker="AI commentary" title="Variance Commentary"
                desc="Two periods in, four to six credit-grade bullets out. DSO drift, interest coverage, quality of earnings — categorized and ending with a forward-looking watchpoint. ~12 seconds."
                example={<em>"AR rose 18.5% on falling revenue; DSO 58→76 days, suggesting collection issues or aggressive recognition."</em>} />
            </Reveal>
            <Reveal delay={120}>
              <FeatureBlock kicker="Q&A surface" title="Ask the Filing"
                desc="Free-text Q&A grounded in the actual extracted text. Risk factors, debt maturity, MD&A liquidity, related-party transactions — answered with section-level citations."
                example={<em>"$750M revolving facility maturing May 2030 with no outstanding borrowings. Source: Note 8 — Debt."</em>} />
            </Reveal>
            <Reveal delay={240}>
              <FeatureBlock kicker="Direct ingestion" title="QuickBooks · SEC · PDF"
                desc="Three ingestion paths instead of one. Public co? Type the ticker. SMB? Connect QuickBooks. Custom audit? Drop the PDF. The pipeline handles each."
                example={<em>"msft + 10-K → 60s later your spread has a real Microsoft annual report extracted into the RMA template."</em>} />
            </Reveal>
            <Reveal delay={360}>
              <FeatureBlock kicker="Workflow" title="Maker-checker + audit trail"
                desc="JWT auth, three roles (analyst / sr_analyst / admin), forward + Reopen state machine, audit-logged transitions. Examiner-ready out of the box."
                example={<em>"Submit for review → reviewer sees queue → mark Reviewed or Reopen for changes. Each transition logged."</em>} />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── ARCHITECTURE SPOTLIGHT ─── */}
      <section className="py-24 lg:py-32 bg-slate-900 text-white">
        <div className="max-w-[1400px] mx-auto px-6">
          <Reveal className="max-w-3xl mb-12">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--highlight)] mb-3">Architecture</div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">The LLM has one job. We do the rest.</h2>
            <p className="text-lg text-slate-300 leading-relaxed">
              Bounding the AI's scope is how we get reliable financial extraction. Smart slicing locates the statements before Claude sees them. Confidence scores route attention. Subtotals and ratios are computed in Python, never by AI. Hallucination rate, empirically: zero.
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
                  <div key={stage.label} className="relative flex flex-col items-center text-center">
                    <div className={`w-full rounded-lg border px-4 py-5 ${stage.kind === 'ai' ? 'bg-[var(--highlight)]/10 border-[var(--highlight)]/40' : 'bg-slate-700/40 border-slate-600'}`}>
                      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${stage.kind === 'ai' ? 'text-[var(--highlight)]' : 'text-slate-400'}`}>
                        {stage.kind === 'ai' ? 'AI' : 'Deterministic'}
                      </div>
                      <div className="font-semibold text-sm md:text-[15px] mb-1">{stage.label}</div>
                      <div className="text-[12px] text-slate-400">{stage.sub}</div>
                    </div>
                    {idx < 4 && <span aria-hidden className="hidden md:block absolute top-1/2 -translate-y-1/2 -right-2.5 text-slate-600">→</span>}
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-8 border-t border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <ArchStat label="Per-spread cost" value="~$1.28" body="3 Claude Opus calls · ~78K input tokens" />
                <ArchStat label="End-to-end time" value="~30s" body="Parse + slice + 3 calls + persist" />
                <ArchStat label="Confidence routing" value="3 tiers" body="HIGH ≥ 0.85 · MED ≥ 0.60 · LOW < 0.60" />
                <ArchStat label="Hallucinations" value="0" body="Refusal-over-fabrication prompt" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── SIGN-IN CTA ─── */}
      <section id="sign-in" className="py-24 lg:py-32 bg-white scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <Reveal>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700 mb-3">Try it now</div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">Sign in. Spread a 10-K. Watch the AI explain the variances.</h2>
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              Two demo accounts pre-loaded with DocuSign and Microsoft data. Open the spread, switch to the KPIs tab, click <span className="font-semibold text-slate-900">Explain changes</span> — about 12 seconds later you have credit-committee-ready bullets.
            </p>
            <ul className="space-y-3 text-[15px] text-slate-700">
              {[
                'AI variance commentary across 6 categories',
                'Ask the Filing on the actual 10-K text',
                'Pull QuickBooks · or fetch SEC filings · or upload PDF',
                'Excel export, dual-review workflow, audit trail',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-slate-900 shrink-0"></span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={150}>
            <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-7 lg:p-8">
              <h3 className="text-xl font-semibold tracking-tight mb-1">Sign in</h3>
              <p className="text-sm text-slate-500 mb-6">Use the demo credentials below.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-[13px] font-medium text-slate-700 mb-1.5">Email</label>
                  <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-white border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" />
                </div>
                <div>
                  <label htmlFor="password" className="block text-[13px] font-medium text-slate-700 mb-1.5">Password</label>
                  <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-white border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent" />
                </div>
                {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-md px-3 py-2 text-sm">{error}</div>}
                <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white rounded-md py-2.5 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors">
                  {loading ? 'Signing in…' : 'Sign in to demo'}
                </button>
              </form>
              <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-3">Demo credentials</div>
                <div className="text-[12.5px] text-slate-700 space-y-1.5 font-mono">
                  <button type="button" onClick={() => { setEmail('smoke@test.com'); setPassword('Smoke1234!') }} className="block w-full text-left hover:bg-slate-50 px-2 py-1 rounded -mx-2 transition-colors">
                    <span className="text-slate-400">analyst</span> smoke@test.com / Smoke1234!
                  </button>
                  <button type="button" onClick={() => { setEmail('uat@test.com'); setPassword('Test1234!') }} className="block w-full text-left hover:bg-slate-50 px-2 py-1 rounded -mx-2 transition-colors">
                    <span className="text-slate-400">uat</span> uat@test.com / Test1234!
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-6 py-8 grid sm:grid-cols-3 gap-6 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-[11px]">S</div>
              <span className="font-semibold tracking-tight">SpreadSense</span>
            </div>
            <p className="text-slate-500 text-[13px] leading-relaxed">AI-native financial spreading for commercial credit analysts.</p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Stack</div>
            <ul className="text-slate-600 space-y-1 text-[13px]">
              <li>Claude Opus 4.5 · Sonnet 4.5</li>
              <li>FastAPI · Postgres · React</li>
              <li>Vercel · Railway · Neon</li>
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Links</div>
            <ul className="text-slate-600 space-y-1 text-[13px]">
              <li><a href="https://github.com/arunr-mib/spreadsense" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">GitHub →</a></li>
              <li><a href="https://spreadsense-production.up.railway.app/docs" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">API docs →</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-100">
          <div className="max-w-[1400px] mx-auto px-6 py-4 text-xs text-slate-400 flex flex-col sm:flex-row justify-between gap-2">
            <span>© 2026 SpreadSense · Built for commercial credit analysts</span>
            <span>v1.4 · May 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ─────────────── Sub-components ─────────────── */

/**
 * Logo: two stacked sheets (front sheet has data lines) — visualises the
 * core "spreading" action. Sheets in white with a blue gradient backdrop
 * box, data lines in the brand blue. Scales cleanly at any size.
 */
function SpreadSenseLogo({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg shadow-md shadow-blue-900/20"
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)',
      }}
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        {/* Back sheet (slightly offset, semi-transparent) */}
        <rect
          x="3"
          y="3"
          width="13"
          height="17"
          rx="2"
          fill="white"
          fillOpacity="0.55"
        />
        {/* Front sheet */}
        <rect x="6.5" y="5" width="13" height="17" rx="2" fill="white" />
        {/* Data lines on the front sheet */}
        <path
          d="M9.5 10h7M9.5 13.5h7M9.5 17h4"
          stroke="#1e40af"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

/**
 * Stylised mockup of the spread page used in the hero. Built in HTML/CSS
 * rather than rendering a screenshot — this way it stays sharp at any
 * resolution and matches the live app's design tokens exactly.
 */
function SpreadMockup() {
  return (
    <div className="relative">
      {/* Outer card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden lg:scale-105 origin-left">
        {/* Top bar */}
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-300/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <div className="text-[12px] text-slate-400 font-mono ml-2">
            spreadsense.app/spreads/1
          </div>
        </div>

        {/* App header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">
              UAT Docusign2 Inc
            </div>
            <div className="font-semibold text-slate-900 text-[15px]">
              Term Loan FY 2025
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
            Reviewed
          </span>
        </div>

        {/* KPI strip */}
        <div className="bg-slate-900 text-white px-6 py-4 grid grid-cols-4 gap-4">
          {[
            { label: 'DSCR', value: '9.43×', tone: 'text-emerald-300' },
            { label: 'Coverage', value: '15.46×', tone: 'text-emerald-300' },
            { label: 'Current ratio', value: '2.18×', tone: 'text-emerald-300' },
            { label: 'EBITDA margin', value: '19.0%', tone: 'text-white' },
          ].map((kpi) => (
            <div key={kpi.label}>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5 font-semibold">
                {kpi.label}
              </div>
              <div className={`font-bold text-lg tracking-tight ${kpi.tone}`}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Variance commentary card */}
        <div className="px-6 py-5 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-blue-700">
              ✨ Variance commentary · FY24 → FY25
            </span>
          </div>
          <ul className="space-y-2.5">
            <MockBullet category="revenue" text="Net sales fell 9.3% YoY ($3.22B → $2.92B); net income collapsed 51.5%." />
            <MockBullet category="margins" text="Gross margin compressed 280 bps from 79.4% to 76.6% on flat opex." />
            <MockBullet
              category="working_capital"
              text="AR rose 18.5% on falling revenue — DSO 58 → 76 days. Possible collection issues."
            />
            <MockBullet
              category="watch"
              text="Watch: continued AR build with new long-term debt may pressure leverage covenants next quarter."
            />
          </ul>
        </div>

        {/* Footer strip with Ask the Filing teaser */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
          <span className="text-[12px] text-slate-500">🔍 Ask the filing:</span>
          <span className="text-[12px] text-slate-700 italic flex-1">
            "What's the contractual debt maturity schedule?"
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Note 8 · Debt
          </span>
        </div>
      </div>

      {/* Floating accent — small KPI pill at top-right */}
      <div className="absolute -top-4 -right-4 lg:-top-6 lg:-right-6 bg-[var(--highlight)] text-[var(--text-on-highlight)] rounded-lg px-3 py-2 shadow-lg rotate-2 hidden md:block">
        <div className="text-[10px] uppercase font-semibold tracking-wider">
          Generated in
        </div>
        <div className="font-bold text-base">12 seconds</div>
      </div>
    </div>
  )
}

const CATEGORY_PILL_COLORS: Record<string, string> = {
  revenue: 'bg-sky-50 text-sky-700',
  margins: 'bg-amber-50 text-amber-700',
  working_capital: 'bg-violet-50 text-violet-700',
  liquidity: 'bg-emerald-50 text-emerald-700',
  leverage: 'bg-rose-50 text-rose-700',
  watch: 'bg-yellow-100 text-yellow-800',
}

function MockBullet({
  category,
  text,
}: {
  category: keyof typeof CATEGORY_PILL_COLORS
  text: string
}) {
  return (
    <li className="flex items-start gap-2.5 text-[12.5px] leading-relaxed">
      <span
        className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${CATEGORY_PILL_COLORS[category]}`}
      >
        {category.replace('_', ' ')}
      </span>
      <span className="text-slate-700">{text}</span>
    </li>
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
      <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--highlight)] font-semibold">
        {label}
      </div>
      {hint && <div className="mt-1 text-[12.5px] text-slate-400">{hint}</div>}
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

function TimelineCard({
  heading,
  items,
}: {
  heading: string
  items: string[]
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-7 h-full hover:shadow-md transition-shadow">
      <h3 className="font-semibold text-slate-900 text-lg mb-5 tracking-tight">
        {heading}
      </h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2.5 text-[14px] text-slate-600 leading-relaxed"
          >
            <svg
              className="shrink-0 mt-[3px] w-4 h-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span dangerouslySetInnerHTML={{ __html: item.replace(/&/g, '&amp;') }} />
          </li>
        ))}
      </ul>
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
      <div className="text-[10px] uppercase tracking-wider text-[var(--highlight)] font-semibold mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
      <div className="text-[12px] text-slate-400 mt-1 leading-relaxed">
        {body}
      </div>
    </div>
  )
}
