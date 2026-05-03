#!/usr/bin/env python3
"""Fetch a company's most recent 10-K from SEC EDGAR and render it as a multi-page PDF.

Useful for testing the spreading pipeline against real, full-length filings
(not cover pages). Uses Chrome's headless mode so the resulting PDF has a
real text layer that PyMuPDF can extract.

Usage:
    ./scripts/fetch_10k_pdf.py docu              # default ticker: DocuSign
    ./scripts/fetch_10k_pdf.py msft              # Microsoft
    ./scripts/fetch_10k_pdf.py --cik 320193      # any company by CIK
    ./scripts/fetch_10k_pdf.py --url 'https://www.sec.gov/...'

Requires Google Chrome installed at the standard macOS path.
"""

import argparse
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# SEC requires a real-looking User-Agent; replace email if you want
USER_AGENT = "FST UAT script test@example.com"

# CIK shortcuts for common tickers
TICKERS = {
    "docu":  "0001261333",  # DocuSign
    "msft":  "0000789019",  # Microsoft
    "aapl":  "0000320193",  # Apple
    "googl": "0001652044",  # Alphabet
    "crm":   "0001108524",  # Salesforce
    "amzn":  "0001018724",  # Amazon
    "meta":  "0001326801",  # Meta
}


def get_latest_10k_url(cik: str) -> str:
    """Look up a company's most recent 10-K filing URL via SEC's submissions API."""
    cik_padded = cik.lstrip("0").zfill(10)
    api = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"
    req = urllib.request.Request(api, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())

    recent = data["filings"]["recent"]
    for i, form in enumerate(recent["form"]):
        if form == "10-K":
            accession = recent["accessionNumber"][i].replace("-", "")
            doc = recent["primaryDocument"][i]
            cik_int = cik.lstrip("0")
            return (
                f"https://www.sec.gov/Archives/edgar/data/"
                f"{cik_int}/{accession}/{doc}"
            )
    raise SystemExit(f"No 10-K found in recent filings for CIK {cik}")


def render_pdf(url: str, output: Path) -> None:
    """Use Chrome headless to render a URL to a multi-page PDF."""
    print(f"  URL:    {url}")
    print(f"  Output: {output}")
    print("  Rendering with Chrome headless...")
    subprocess.run(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--virtual-time-budget=15000",  # let SEC's JS settle
            f"--user-agent={USER_AGENT}",   # SEC blocks default Chrome UA
            f"--print-to-pdf={output}",
            url,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("ticker", nargs="?", default="docu",
                   help=f"Ticker shortcut. Known: {', '.join(TICKERS)}")
    p.add_argument("--cik", help="Override with explicit CIK")
    p.add_argument("--url", help="Skip lookup, render this URL directly")
    p.add_argument("--output", default="/tmp/sec_10k.pdf",
                   help="Where to save the PDF (default: /tmp/sec_10k.pdf)")
    args = p.parse_args()

    if args.url:
        url = args.url
        label = "(custom URL)"
    else:
        cik = args.cik or TICKERS.get(args.ticker.lower())
        if not cik:
            sys.exit(f"Unknown ticker '{args.ticker}'. Use --cik or --url, or pick: {', '.join(TICKERS)}")
        label = args.ticker.upper() if not args.cik else f"CIK {args.cik}"
        print(f"Looking up latest 10-K for {label}...")
        url = get_latest_10k_url(cik)

    output = Path(args.output)
    render_pdf(url, output)

    if not output.exists():
        sys.exit("PDF was not created. Check Chrome installation and SEC URL.")
    size = output.stat().st_size
    print(f"\n  Saved {output} ({size:,} bytes, {size / 1024 / 1024:.1f} MB)")

    # Quick sanity check: extract text to confirm it has real content
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(output)
        text = "\n".join(p.get_text("text") for p in doc)
        print(f"  Pages:  {len(doc)}")
        print(f"  Text:   {len(text):,} chars extracted")
        snippet = text.strip()[:200].replace("\n", " ")
        print(f"  Preview: {snippet}...")
    except ImportError:
        print("  (Install PyMuPDF to verify text extraction: pip install pymupdf)")

    print(f"\nUpload it via the UI at http://localhost:5174")
    print(f"  or with curl:")
    print(
        f"  curl -X POST 'http://localhost:8001/ingestion/upload?spread_id=1' \\\n"
        f"    -H \"Authorization: Bearer $TOKEN\" \\\n"
        f"    -F 'file=@{output};type=application/pdf'"
    )


if __name__ == "__main__":
    main()
