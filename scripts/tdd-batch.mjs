import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'vite'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
let sharp
try { sharp = require(process.env.TDD_RUNTIME_PACKAGES ? join(process.env.TDD_RUNTIME_PACKAGES, 'sharp') : 'sharp') }
catch { throw new Error('Batch image conversion needs sharp. Set TDD_RUNTIME_PACKAGES to the bundled Node package directory, or use a local sharp installation.') }
const dataDir = resolve(process.argv[2] || '.data')
const outputDir = resolve(process.argv[3] || '/tmp/themis-tdd-runs/latest')
const sourceHashes = Object.fromEntries(await Promise.all(['src/core/analyze.ts', 'src/core/parse.ts', 'src/core/model.ts', 'src/core/zip.ts', 'src/core/tdd.ts', 'src/core/tddDiagrams.ts', 'src/core/tddExport.ts', 'src/ui/editor/describe.ts', 'scripts/tdd-batch.mjs', 'package.json', 'package-lock.json'].map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
await mkdir(outputDir, { recursive: true })
try {
  const { analyzeZips } = await server.ssrLoadModule('/src/core/analyze.ts')
  const { buildTdd } = await server.ssrLoadModule('/src/core/tdd.ts')
  const { prepareTdd, exportTddDocx, exportTddPdf } = await server.ssrLoadModule('/src/core/tddExport.ts')
  const { solutionFlows, flowDiagrams } = await server.ssrLoadModule('/src/core/tddDiagrams.ts')
  const rasterize = async data => {
    const pipeline = sharp(data, { density: 180 }).flatten({ background: '#ffffff' }).resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
    const { data: image, info } = await pipeline.png().toBuffer({ resolveWithObject: true })
    return { data: new Uint8Array(image), width: info.width, height: info.height }
  }
  const names = (await readdir(dataDir)).filter(n => n.toLowerCase().endsWith('.zip')).sort()
  const zips = await Promise.all(names.map(async name => ({ name, data: new Uint8Array(await readFile(join(dataDir, name))) })))
  const runs = [...zips.map(z => ({ name: z.name.replace(/\.zip$/i, ''), zips: [z] })), { name: 'combined', zips }]
  const manifest = []
  for (const run of runs) {
    const analysis = analyzeZips(run.zips), model = buildTdd(analysis)
    const document = await prepareTdd(model, rasterize)
    const docx = join(outputDir, run.name + '.docx'), pdf = join(outputDir, run.name + '.pdf')
    await writeFile(docx, await exportTddDocx(document))
    const pdfBytes = await exportTddPdf(document)
    await writeFile(pdf, pdfBytes)
    const pdfPages = (Buffer.from(pdfBytes).toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length
    const coverage = { name: run.name, archives: run.zips.map(z => ({ name: z.name, sha256: createHash('sha256').update(z.data).digest('hex') })), sourceHashes, introduction: model.introduction, processSummary: model.processSummary, docx, pdf, pdfPages, taskbots: model.bots.map(b => ({ path: b.bot.path, sourceZip: b.bot.sourceZip, actions: b.bot.actions.length, flowNodes: b.flow.nodes.length, flowEdges: b.flow.edges.length, diagramParts: solutionFlows(b).reduce((n, f) => n + flowDiagrams(f.flow, f.title).length, 0), screenshotReferences: b.images.map(i => ({ line: i.line, actionUid: i.actionUid, source: i.source, role: i.role })), missingImages: b.imageIssues, calls: b.calls, flow: b.flow })), duplicateTaskbots: analysis.duplicateTaskbots, includedFiles: analysis.otherFiles.map(f => ({ path: f.path, sourceZip: f.sourceZip, kind: f.kind, size: f.size })) }
    await writeFile(join(outputDir, run.name + '.coverage.json'), JSON.stringify(coverage, null, 2))
    manifest.push({ name: run.name, docx, pdf, pdfPages, taskbots: model.bots.length, images: model.bots.reduce((n, b) => n + b.images.length, 0), diagramParts: coverage.taskbots.reduce((n, b) => n + b.diagramParts, 0), sourceHashes, archives: coverage.archives })
    console.log(JSON.stringify(manifest.at(-1)))
  }
  await writeFile(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
} finally { await server.close() }
