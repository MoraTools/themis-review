import { unzipSync } from 'fflate'

export interface ZipEntry {
  path: string // forward-slash, no leading slash
  data: Uint8Array
  sourceZip: string
}

/** Unzip one archive to file entries (directories skipped). */
export function readZip(name: string, bytes: Uint8Array): ZipEntry[] {
  const files = unzipSync(bytes)
  return Object.entries(files)
    .filter(([p, d]) => !p.endsWith('/') && d.length > 0)
    .map(([p, data]) => ({ path: p.replace(/\\/g, '/'), data, sourceZip: name }))
}

const decoder = new TextDecoder('utf-8')

export function asText(e: ZipEntry): string {
  return decoder.decode(e.data)
}

/** File names and localized folder names do not identify a Taskbot. Check JSON bytes, then validate the parsed shape. */
export function isTaskbotCandidate(path: string, data?: Uint8Array): boolean {
  const basename = path.split('/').pop() ?? ''
  if (!basename) return false
  if (!data) return true
  let offset = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf ? 3 : 0
  while ([9, 10, 13, 32].includes(data[offset])) offset++
  return data[offset] === 123
}
