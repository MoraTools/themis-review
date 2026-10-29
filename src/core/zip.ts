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

/** Taskbot files carry no extension. The folder they sit in is localized by the
 *  Control Room UI language (tasks/Tareas/Aufgaben/...), so the name is never matched —
 *  parseTaskbot validates the JSON shape and analyze skips whatever fails. */
export function isTaskbotCandidate(path: string): boolean {
  const basename = path.split('/').pop() ?? ''
  return basename.length > 0 && !basename.includes('.')
}
