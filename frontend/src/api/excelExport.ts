import { apiClient } from './client'

function parseFilename(disposition: string | undefined): string {
  if (!disposition) return 'spread.xlsx'
  const match = disposition.match(/filename="?([^"]+)"?/)
  return match?.[1] ?? 'spread.xlsx'
}

export async function downloadSpreadXlsx(spreadId: number): Promise<void> {
  const res = await apiClient.get<Blob>(`/spreads/${spreadId}/export.xlsx`, {
    responseType: 'blob',
    validateStatus: () => true,
  })
  if (res.status >= 400) {
    const text = await (res.data as Blob).text()
    let detail = `Export failed (${res.status})`
    try {
      detail = JSON.parse(text).detail ?? detail
    } catch {
      // not JSON
    }
    throw new Error(detail)
  }
  const filename = parseFilename(res.headers['content-disposition'])
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
