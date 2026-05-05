# Rendered Docs

Pre-rendered HTML + PDF versions of the SpreadSense reference docs, generated from their `docs/*.md` sources. These are committed so reviewers can link to them on GitHub or share the PDFs without needing pandoc + WeasyPrint locally.

## Files

| Output | Source | Audience |
|---|---|---|
| `SpreadSense-Explainer.{html,pdf}` | `docs/SpreadSense-Explainer.md` | Credit leadership / non-technical leave-behind (~3 pages) |
| `SpreadSense-Architecture-Briefing.{html,pdf}` | `docs/SpreadSense-Architecture-Briefing.md` | Q&A reference for technical questions (~10 pages) |
| `SpreadSense-AI-PRD.{html,pdf}` | `docs/SpreadSense-AI-PRD.md` | Full PRD v1.4 for engineering / IT / risk reviewers |

## How to regenerate

After editing any of the source `docs/*.md` files:

```bash
./scripts/render_docs.sh
```

Requires:
- `pandoc` (`brew install pandoc`)
- The dev `backend` container running (`docker compose up -d backend`) — the script uses its installed WeasyPrint to produce PDFs without needing LaTeX system-wide.

The script is idempotent — re-running overwrites in place. Commit the resulting changes alongside the markdown edit so the rendered version stays in sync.

## Sharing externally

- **GitHub:** click the `.pdf` file → "View raw" or "Download."
- **Google Drive / Slack / email:** drag the PDF in. Each is <100 KB.
- **Print:** browser-render the HTML and Cmd+P → Save as PDF. Print-style CSS is embedded so headings break cleanly across pages.
