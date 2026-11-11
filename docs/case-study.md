# SpreadSense, case study

## The problem

Spreading a borrower's financials, manually transcribing a PDF income statement and balance sheet into a bank's standard RMA template, is a few hours of careful, low-judgment transcription per deal. The judgment credit analysts actually get paid for (does this ratio trend worry me, is this add-back legitimate) happens after the spread exists, not during it. SpreadSense's job is to compress the transcription step from hours to minutes without quietly introducing errors into numbers a credit decision depends on.

## The product decision: confidence scores, not silent automation

The tempting version of this product hides the AI entirely: extract everything, show a finished grid, done. I didn't build that, because a wrong number that looks identical to a right number is worse than no automation at all in a lending context. Every extracted field carries a confidence score, and the reviewer's job is explicitly to verify low-confidence fields before the spread is trusted, not to re-check everything from scratch. The product's value is "tell me where to look," not "trust me completely." It's the same philosophy as CreditScout's abstain guardrail, applied to extraction instead of calculation.

## A real bug this caught: false-positive "passing" status

While auditing the product for a public release, I found the KPI cards on a brand-new, zero-data spread showing green "passing" status on every covenant ratio, before a single number had been entered. The color/status functions (`cellColor`, `cardBorderColor`, `cardStatusText`, `cardStatusColor` in `KpiSection.tsx`) checked whether a ratio breached or neared its threshold, but never checked whether the ratio had actually been computed yet; `null` fell through to the same branch as "comfortably passing." In a credit tool, a false "passing" signal is the one failure mode that actively misleads a reviewer rather than just being unhelpful, so this was a release blocker, not a polish item. Fixed by threading the raw value through all four functions and returning a neutral "not yet computed" state instead of defaulting to pass.

## Infrastructure as a product-decision surface, not just DevOps

Making this public required a real audit, not just flipping the repo to public: CI had been red for months on two independent root causes (a `setuptools` flat-layout packaging failure once `migrations/` existed alongside `app/`, and missing native libs for WeasyPrint's PDF rendering in the GitHub Actions runner). Both were invisible in local dev because the Docker image installs `pyproject.toml` before copying the rest of the tree, masking the exact ordering bug that broke a bare `pip install -e .`. I reproduced both in an isolated bare container before trusting either fix. "It works on my machine" isn't evidence when the machine is the thing hiding the bug.

## What's still open

The original demo's hosting (Railway backend, Neon Postgres) was lost to an access issue outside my control. Rather than rebuild on a new paid platform speculatively, I confirmed the problem, restored a dormant Supabase project as a ready alternative, and prepared a Render Blueprint for one-command redeploy, then paused the migration itself, since re-platforming a live demo is a cost and account-management decision, not just an engineering one. Knowing when *not* to keep building is part of the same judgment this project is meant to demonstrate.
