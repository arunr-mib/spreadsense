// frontend/src/api/secFetcher.ts
import { apiClient } from './client'

export interface FetchedFiling {
  blob: Blob
  filename: string
  pageCount: number
}

/**
 * Fetch the latest SEC filing of the given form for a ticker.
 * Returns the PDF blob plus metadata extracted from response headers.
 * Throws an Error with the server's `detail` message on non-2xx responses.
 */
export async function fetchSecFiling(ticker: string, form: '10-K' | '10-Q'): Promise<FetchedFiling> {
  const res = await apiClient.get<Blob>('/sec/fetch', {
    params: { ticker, form },
    responseType: 'blob',
    validateStatus: () => true,
  })

  if (res.status >= 400) {
    const text = await (res.data as Blob).text()
    let detail = `Request failed (${res.status})`
    try {
      detail = JSON.parse(text).detail ?? detail
    } catch {
      /* keep default */
    }
    throw new Error(detail)
  }

  const filename = parseFilename(res.headers['content-disposition'])
  const pageCount = parseInt(res.headers['x-pdf-pages'] ?? '0', 10)
  return { blob: res.data, filename, pageCount }
}

function parseFilename(contentDisposition: string | undefined): string {
  if (!contentDisposition) return 'sec_filing.pdf'
  const match = /filename="([^"]+)"/.exec(contentDisposition)
  return match ? match[1] : 'sec_filing.pdf'
}
