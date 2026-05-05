#!/usr/bin/env bash
# Render the SpreadSense markdown docs to HTML + PDF in docs/exports/.
#
# Usage:   ./scripts/render_docs.sh
# Requires:
#   - pandoc          (`brew install pandoc`)
#   - docker compose  (uses the running backend container's WeasyPrint
#                      so we don't need a system-wide LaTeX install)
#
# Output: docs/exports/{SpreadSense-Explainer,SpreadSense-AI-PRD,
#                      SpreadSense-Architecture-Briefing}.{html,pdf}

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

OUT_DIR="docs/exports"
mkdir -p "$OUT_DIR"

# Shared CSS used for both HTML and PDF (PDF inherits via WeasyPrint).
read -r -d '' CSS << 'CSS_EOF' || true
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 820px; margin: 40px auto; padding: 0 24px; color: #1e293b; line-height: 1.6; }
h1 { color: #4338ca; border-bottom: 3px solid #6366f1; padding-bottom: 8px; }
h2 { color: #4338ca; margin-top: 36px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; page-break-before: always; }
h3 { color: #475569; margin-top: 24px; }
h4 { color: #64748b; margin-top: 16px; }
code { background: #f1f5f9; padding: 1px 6px; border-radius: 3px; font-size: 0.88em; color: #4338ca; }
pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.78em; line-height: 1.4; }
pre code { background: transparent; padding: 0; color: #1e293b; }
blockquote { border-left: 4px solid #6366f1; background: #eef2ff; margin: 14px 0; padding: 10px 16px; color: #334155; }
table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 0.92em; }
th { background: #4338ca; color: white; text-align: left; padding: 6px 10px; }
td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
tr:nth-child(even) { background: #f8fafc; }
hr { border: none; border-top: 1px solid #cbd5e1; margin: 28px 0; }
strong { color: #1e293b; }
#TOC { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px 24px; border-radius: 8px; margin: 24px 0; }
#TOC ul { padding-left: 20px; }
#TOC > ul { padding-left: 0; list-style: none; }
@media print { body { max-width: 100%; margin: 0; } h2 { page-break-before: always; } pre, blockquote, table { page-break-inside: avoid; } }
CSS_EOF

# Detect which doc(s) to render. Default: all three.
DOCS=(
  "SpreadSense-Explainer:SpreadSense — Plain-English Explainer:0"
  "SpreadSense-AI-PRD:SpreadSense AI — PRD v1.4:1"
  "SpreadSense-Architecture-Briefing:SpreadSense — Architecture Briefing:1"
)

for entry in "${DOCS[@]}"; do
  IFS=':' read -r slug title with_toc <<< "$entry"
  src="docs/${slug}.md"
  html_out="${OUT_DIR}/${slug}.html"
  pdf_out="${OUT_DIR}/${slug}.pdf"

  if [ ! -f "$src" ]; then
    echo "Skipping $slug — source missing: $src"
    continue
  fi

  echo "→ ${slug}"

  toc_args=""
  if [ "$with_toc" = "1" ]; then
    toc_args="--toc --toc-depth=2"
  fi

  # Pandoc reads CSS from a temp file so it can embed it standalone.
  css_file="$(mktemp)"
  echo "$CSS" > "$css_file"

  pandoc "$src" \
    -f markdown \
    -t html5 \
    --standalone \
    $toc_args \
    --metadata title="$title" \
    --css="$css_file" \
    -o "$html_out"
  rm -f "$css_file"

  # Render HTML → PDF inside the running backend container (uses WeasyPrint).
  if ! docker compose ps backend 2>/dev/null | grep -q Up; then
    echo "  ⚠ backend container not running — skipping PDF for ${slug}."
    echo "    Start it with: docker compose up -d backend"
    continue
  fi

  docker compose cp "$html_out" "backend:/tmp/${slug}.html" >/dev/null
  docker compose exec -T backend python -c "
from weasyprint import HTML
HTML(filename='/tmp/${slug}.html').write_pdf('/tmp/${slug}.pdf')
"
  docker compose cp "backend:/tmp/${slug}.pdf" "$pdf_out" >/dev/null
  echo "  ✓ ${html_out} + ${pdf_out}"
done

echo ""
echo "Done. Outputs in $OUT_DIR/"
ls -la "$OUT_DIR"
