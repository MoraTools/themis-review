import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, HeadingLevel, WidthType, BorderStyle, AlignmentType, PageNumber, Footer } from 'docx'
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { actionDetails, actionSummary, actionText, bytesDataUrl, isSecretField, redactText, sourceFields, type TddImage, type TddModel } from './tdd'
import { dependencyDiagrams, flowDiagrams, solutionFlows, type Diagram } from './tddDiagrams'

;(pdfMake as typeof pdfMake & { addVirtualFileSystem(files: unknown): void }).addVirtualFileSystem(pdfFonts)
export interface Raster { data: Uint8Array; width: number; height: number }
export type Rasterizer = (data: Uint8Array, mime: string) => Promise<Raster>
type Block = { kind: 'heading'; text: string; level: 1 | 2 | 3; page?: boolean } | { kind: 'text'; text: string; small?: boolean } | { kind: 'table'; headers: string[]; rows: string[][]; widths?: number[] } | { kind: 'image'; raster: Raster; caption: string; page?: boolean }
export interface PreparedTdd { title: string; blocks: Block[] }
const utf8 = new TextEncoder()
export async function browserRasterize(data: Uint8Array, mime: string): Promise<Raster> {
  const image = new Image()
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
  try {
    image.src = url
    await image.decode()
    const ratio = Math.min(1, 1800 / image.width, 1800 / image.height)
    const width = Math.max(1, Math.round(image.width * ratio)), height = Math.max(1, Math.round(image.height * ratio))
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Image conversion is not available')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image conversion failed')), 'image/png'))
    return { data: new Uint8Array(await blob.arrayBuffer()), width, height }
  } finally { URL.revokeObjectURL(url) }
}
function sameBytes(a: Uint8Array, b: Uint8Array): boolean { return a.length === b.length && a.every((v, i) => v === b[i]) }
/** Both formats consume this one ordered content and image model. No output path fetches external content. */
export async function prepareTdd(model: TddModel, rasterize: Rasterizer = browserRasterize): Promise<PreparedTdd> {
  const blocks: Block[] = []
  const botRef = (path: string) => { const index = model.bots.findIndex(b => b.bot.path === path); return index < 0 ? path : `T${index + 1} ${model.bots[index].bot.name}` }
  const heading = (value: string, level: 1 | 2 | 3 = 1, page = false) => blocks.push({ kind: 'heading', text: value, level, page })
  const paragraph = (value: string, small = false) => blocks.push({ kind: 'text', text: value, small })
  const table = (headers: string[], rows: string[][], widths?: number[]) => { if (rows.length) blocks.push({ kind: 'table', headers, rows, widths }) }
  const diagram = async (d: Diagram, page = true) => { heading(d.title, 3, page); blocks.push({ kind: 'image', raster: await rasterize(utf8.encode(d.svg), 'image/svg+xml'), caption: d.caption }) }
  heading('Document control')
  table(['Field', 'Value'], [['Source archives', model.analysis.zipNames.join('\n')], ['Document method', 'Deterministic extraction from included source files']], [0.25, 0.75])
  heading('Introduction'); paragraph(model.introduction)
  heading('Process summary'); paragraph(model.processSummary)
  heading('Source scope')
  table(['Taskbot', 'Source path', 'Archive'], model.bots.map(b => [botRef(b.bot.path), b.bot.path, b.bot.sourceZip]), [0.24, 0.52, 0.24])
  if (model.analysis.duplicateTaskbots?.length) table(['Shared Taskbot', 'Selected archive', 'Other archive', 'Source status'], model.analysis.duplicateTaskbots.map(b => [b.path.split('/').pop()!, b.selectedZip, b.sourceZip, b.identical ? 'Identical source' : 'Different source; first uploaded archive selected']))
  heading('Architecture and dependencies', 1, true)
  for (const [index, d] of dependencyDiagrams(model).entries()) await diagram(d, index > 0)
  heading('Taskbot design', 1, true)
  for (let botIndex = 0; botIndex < model.bots.length; botIndex++) {
    const item = model.bots[botIndex], bot = item.bot
    heading(`T${botIndex + 1} ${bot.name}`, 2, botIndex > 0)
    paragraph(`Source: ${bot.path} | ${bot.sourceZip}`, true)
    table(['Variable', 'Type', 'Direction', 'Source description'], bot.variables.filter(v => v.input || v.output).map(v => [v.name, v.type + (v.subtype ? '/' + v.subtype : ''), [v.input ? 'Input' : '', v.output ? 'Output' : '', v.readOnly ? 'Read only' : ''].filter(Boolean).join(' / '), redactText(v.description)]), [0.26, 0.17, 0.17, 0.4])
    const localTypes = [...new Set(bot.variables.filter(v => !v.input && !v.output).map(v => v.type))]
    for (const type of localTypes) paragraph(`Local ${type}: ${bot.variables.filter(v => !v.input && !v.output && v.type === type).map(v => v.name).join(', ')}`, true)
    const about = bot.actions.filter(a => /documentation_about/.test(a.commandName)).map(a => `L${a.line}: ${actionDetails(a)}`).filter(Boolean)
    if (about.length) { heading('Source documentation', 3); about.forEach(s => paragraph(s)) }
    for (const view of solutionFlows(item)) for (const d of flowDiagrams(view.flow, view.title)) await diagram(d)
    const emitted: { image: TddImage; number: number }[] = []
    const overview = solutionFlows(item)[0].flow
    const collapsedLines = new Set(overview.nodes.filter(n => n.id.startsWith('scope')).flatMap(n => n.lines))
    const controls = bot.actions.filter(a => a.reachable && collapsedLines.has(a.line) && /^(?:if|elseIf|loop\.commands\.(?:start|break|continue)|try|catch|finally|throw|stopTask|runTask)$/.test(a.commandName))
    const nodeForLine = (line: number) => item.flow.nodes.filter(n => n.lines.includes(line))
    if (controls.length) heading('Source control details', 3)
    table(['Source', 'Control or call', 'Runtime outcomes'], controls.map(a => {
      const outcomes = nodeForLine(a.line).flatMap(n => item.flow.edges.filter(e => e.from === n.id).map(e => {
        const target = item.flow.nodes.find(t => t.id === e.to)!
        return `${e.label || 'Next'} -> ${target.lines.length ? 'L' + Math.min(...target.lines) : target.label}`
      }))
      return ['L' + a.line, actionText(a), [...new Set(outcomes)].join('\n')]
    }), [0.09, 0.51, 0.4])
    const technical = bot.actions.filter(a => a.reachable && /config_read|runApp|openbrowser|rest(?:Get|Post)|connect|OpenSpreadsheet|OpenCSVTXT|copyFiles|downloadTo|executeFunction|createFolder|deleteFolder|deleteFiles|renameFiles|startRecordSession|EndRecordSession/i.test(a.commandName))
    if (technical.length) heading('Source operation parameters', 3)
    table(['Source line', 'Technical operation', 'Source target or input'], technical.map(a => ['L' + a.line, actionText(a), actionDetails(a)]), [0.09, 0.4, 0.51])
    for (const a of bot.actions.filter(a => item.images.some(i => i.line === a.line))) {
      heading(`L${a.line} ${actionSummary(a)}${a.reachable ? '' : ' (disabled)'}`, 3)
      const context = [...bot.actions].reverse().find(parent => parent.line < a.line && (parent.uid === a.parentUid || (parent.parentUid === a.parentUid && /comment|documentation/.test(parent.commandName))))
      if (context && !/^(?:try|catch|finally)$/.test(context.commandName)) paragraph(`Source step L${context.line}: ${actionSummary(context)}`, true)
      for (const image of item.images.filter(img => img.line === a.line)) {
        const previous = emitted.find(e => sameBytes(e.image.data, image.data))
        if (previous) { paragraph(`Same source image as figure ${previous.number} (L${previous.image.line}).`, true); continue }
        const number = emitted.length + 1
        try { blocks.push({ kind: 'image', raster: await rasterize(image.data, image.mime), caption: `Figure ${number}. ${bot.name} L${image.line} | ${actionSummary(a)} | ${image.source.split('/').pop()}` }); emitted.push({ image, number }) } catch { paragraph(`Source image could not be decoded (${image.source}).`, true) }
      }
    }
    if (item.references.length) {
      const locations = new Map<string, { lines: Set<number>; value: string; files: string[] }>()
      for (const reference of item.references) { const key = reference.value + '|' + reference.files.join('|'), row = locations.get(key) ?? { lines: new Set<number>(), value: reference.value, files: reference.files }; row.lines.add(reference.line); locations.set(key, row) }
      heading('Referenced locations', 3)
      table(['Source lines', 'Location', 'Included source'], [...locations.values()].map(r => [[...r.lines].map(line => 'L' + line).join(', '), r.value, r.files.map(path => model.bots.some(b => b.bot.path === path) ? botRef(path) : path.split('/').pop()!).join('\n') || 'External or not included']), [0.17, 0.6, 0.23])
    }
    if (item.imageIssues.length) { heading('Unavailable source images', 3); item.imageIssues.forEach(s => paragraph(s, true)) }
    const events = bot.actions.filter(a => a.reachable && /log/i.test(a.commandName))
    const logRows = new Map<string, { lines: number[]; label: string }>()
    for (const a of events) { const label = actionText(a), row = logRows.get(label) ?? { lines: [], label }; row.lines.push(a.line); logRows.set(label, row) }
    if (events.length) { heading('Source logs', 3); table(['Source lines', 'Log operation'], [...logRows.values()].map(row => [row.lines.map(n => 'L' + n).join(', '), row.label]), [0.2, 0.8]) }
    const disabled = bot.actions.filter(a => !a.reachable)
    if (disabled.length) paragraph(`Disabled source actions: ${disabled.map(a => 'L' + a.line).join(', ')}. Disabled actions have no runtime transitions.`, true)
  }
  if (model.analysis.otherFiles.length) {
    heading('Configuration assets and reference files', 1, true)
    table(['Source file', 'Kind', 'Bytes', 'Archive'], model.analysis.otherFiles.map(f => [f.path, f.kind, String(f.size), f.sourceZip]), [0.52, 0.1, 0.1, 0.28])
    for (const file of model.analysis.otherFiles.filter(f => f.kind === 'config' && /\.(?:xml|json|ini|cfg|properties|txt)$/i.test(f.path))) {
      const raw = model.analysis.archiveFiles?.find(f => f.path === file.path && f.sourceZip === file.sourceZip)
      if (!raw) continue
      const contents = new TextDecoder().decode(raw.data)
      const records: string[][] = []
      if (/\.xml$/i.test(file.path)) {
        for (const m of contents.matchAll(/<([\w:.-]+)(?:\s[^>]*)?>([^<>]*)<\/\1>/g)) {
          const line = contents.slice(0, m.index).split('\n').length
          const value = isSecretField(m[1]) ? '[REDACTED]' : redactText(m[2].trim())
          if (value) records.push(['L' + line, m[1], value])
        }
      } else if (/\.json$/i.test(file.path)) {
        try { records.push(...sourceFields(JSON.parse(contents)).map(s => ['', s.slice(0, s.indexOf(':')), s.slice(s.indexOf(':') + 1).trim()])) } catch { /* No invented configuration values for malformed files. */ }
      } else contents.split('\n').forEach((line, i) => { const m = line.match(/^\s*([^#;][^=:]+)\s*[=:]\s*(.*)$/); if (m) records.push(['L' + (i + 1), m[1].trim(), isSecretField(m[1]) ? '[REDACTED]' : redactText(m[2])]) })
      if (records.length) { heading(file.path.split('/').pop()!, 2); paragraph(file.path, true); table(['Source line', 'Configuration key', 'Source value'], records, [0.1, 0.3, 0.6]) }
    }
  }
  return { title: model.title, blocks }
}
function dimensions(raster: Raster, maxWidth = 490, maxHeight = 590) { const scale = Math.min(maxWidth / raster.width, maxHeight / raster.height, 1); return { width: raster.width * scale, height: raster.height * scale } }
const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' }
export async function exportTddDocx(document: PreparedTdd): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [new Paragraph({ text: document.title, heading: HeadingLevel.TITLE })]
  for (let blockIndex = 0; blockIndex < document.blocks.length; blockIndex++) {
    const block = document.blocks[blockIndex]
    if (block.kind === 'heading') children.push(new Paragraph({ text: block.text, heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, pageBreakBefore: block.page, keepNext: true }))
    else if (block.kind === 'text') children.push(new Paragraph({ children: block.text.split('\n').map((s, i) => new TextRun({ text: s, break: i ? 1 : 0, size: block.small ? 18 : 21 })), keepNext: document.blocks[blockIndex + 1]?.kind === 'image', spacing: { after: block.text ? 100 : 160 } }))
    else if (block.kind === 'table') {
      const fractions = block.widths ?? block.headers.map(() => 1 / block.headers.length)
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: fractions.map(f => Math.round(f * 9800)), borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border }, rows: [block.headers, ...block.rows].map((row, i) => new TableRow({ tableHeader: i === 0, cantSplit: false, children: row.map((cell, j) => new TableCell({ width: { size: Math.round(fractions[j] * 9800), type: WidthType.DXA }, margins: { top: 85, bottom: 85, left: 100, right: 100 }, shading: { fill: i === 0 ? 'E8EDF2' : i % 2 ? 'FFFFFF' : 'F7F8FA' }, children: [new Paragraph({ children: cell.split('\n').map((s, k) => new TextRun({ text: s, break: k ? 1 : 0, size: 17, bold: i === 0 })), spacing: { after: 0, line: 230 } })] })) })) }))
      children.push(new Paragraph({ spacing: { after: 70 } }))
    } else {
      const d = dimensions(block.raster)
      children.push(new Paragraph({ children: [new ImageRun({ data: block.raster.data, type: 'png', transformation: { width: d.width * 96 / 72, height: d.height * 96 / 72 } })], alignment: AlignmentType.CENTER, keepNext: true, pageBreakBefore: block.page }))
      children.push(new Paragraph({ text: block.caption, style: 'Caption', spacing: { after: 140 } }))
    }
  }
  const doc = new Document({ creator: '', title: document.title, description: 'Deterministic Automation Anywhere source documentation', styles: { default: { document: { run: { font: 'Arial', size: 21, color: '000000' }, paragraph: { spacing: { after: 100 } } }, title: { run: { font: 'Arial', size: 38, bold: true, color: '000000' } }, heading1: { run: { font: 'Arial', size: 29, bold: true, color: '000000' }, paragraph: { spacing: { before: 220, after: 100 } } }, heading2: { run: { font: 'Arial', size: 25, bold: true, color: '000000' }, paragraph: { spacing: { before: 190, after: 80 } } }, heading3: { run: { font: 'Arial', size: 22, bold: true, color: '000000' }, paragraph: { spacing: { before: 170, after: 80 } } } }, paragraphStyles: [{ id: 'Caption', name: 'Caption', basedOn: 'Normal', run: { font: 'Arial', size: 17, color: '404040' } }] }, sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 800, bottom: 800, left: 950, right: 950 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], size: 17 })] })] }) }, children }] })
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer())
}
export function exportTddPdf(document: PreparedTdd): Promise<Uint8Array> {
  const content: Content[] = [{ text: document.title, fontSize: 23, bold: true, margin: [0, 0, 0, 16] }]
  for (let blockIndex = 0; blockIndex < document.blocks.length; blockIndex++) {
    const block = document.blocks[blockIndex]
    if (block.kind === 'heading' && block.level === 3) {
      const stack: Content[] = [{ text: block.text, fontSize: 11, bold: true, margin: [0, 10, 0, 7] }]
      let lookahead = blockIndex + 1
      while (document.blocks[lookahead]?.kind === 'text') {
        const next = document.blocks[lookahead] as Extract<Block, { kind: 'text' }>
        stack.push({ text: next.text, fontSize: next.small ? 9 : 10.5, margin: [0, 0, 0, 7] }); lookahead++
      }
      const figure = document.blocks[lookahead]
      if (figure?.kind === 'image') {
        const d = dimensions(figure.raster)
        stack.push({ image: bytesDataUrl(figure.raster.data, 'image/png'), width: d.width, height: d.height, alignment: 'center' }, { text: figure.caption, fontSize: 8.5, color: '#404040', margin: [0, 5, 0, 9] })
        content.push({ stack, unbreakable: true, ...(block.page ? { pageBreak: 'before' as const } : {}) }); blockIndex = lookahead; continue
      }
    }
    if (block.kind === 'heading') content.push({ text: block.text, fontSize: block.level === 1 ? 16 : block.level === 2 ? 14 : 11, bold: true, margin: [0, 12, 0, 7], ...(block.page ? { pageBreak: 'before' as const } : {}) })
    else if (block.kind === 'text') content.push({ text: block.text || ' ', fontSize: block.small ? 9 : 10.5, margin: [0, 0, 0, 7] })
    else if (block.kind === 'table') content.push({ table: { headerRows: 1, widths: (block.widths ?? block.headers.map(() => 1 / block.headers.length)).map(f => f * (499 - 8 * block.headers.length)), body: [block.headers.map(text => ({ text, bold: true, fillColor: '#e8edf2' })), ...block.rows.map((row, i) => row.map(text => ({ text, fillColor: i % 2 ? '#f7f8fa' : '#ffffff' })))] }, fontSize: 8.5, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#d9d9d9', vLineColor: () => '#d9d9d9', paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4 }, margin: [0, 0, 0, 9] })
    else { const d = dimensions(block.raster); content.push({ stack: [{ image: bytesDataUrl(block.raster.data, 'image/png'), width: d.width, height: d.height, alignment: 'center' }, { text: block.caption, fontSize: 8.5, color: '#404040', margin: [0, 5, 0, 9] }], unbreakable: true }) }
  }
  const definition: TDocumentDefinitions = { info: { title: document.title, author: '', subject: 'Automation Anywhere source documentation', creationDate: new Date('2000-01-01T00:00:00Z'), modDate: new Date('2000-01-01T00:00:00Z') }, pageSize: 'A4', pageMargins: [48, 40, 48, 40], defaultStyle: { font: 'Roboto', fontSize: 10.5, color: '#000000' }, content, footer: (page) => ({ text: String(page), alignment: 'right', margin: [0, 0, 48, 0], fontSize: 8.5 }) }
  return new Promise(resolve => pdfMake.createPdf(definition).getBuffer(buffer => resolve(new Uint8Array(buffer))))
}
