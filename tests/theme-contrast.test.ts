import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8')
type Color = [number, number, number]
const linear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const gamma = (c: number) => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055

function toLab(rgb: Color): Color {
  const [r, g, b] = rgb.map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function fromLab([L, a, b]: Color): Color {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(c => Math.max(0, Math.min(1, gamma(c)))) as Color
}
function luminance(rgb: Color) {
  const [r, g, b] = rgb.map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: Color, b: Color) {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
function tokens(block: string) {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]))
}
function resolve(value: string, values: Record<string, string>): Color {
  if (/^#[\da-f]{6}$/i.test(value)) return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255) as Color
  const variable = value.match(/^var\((--[\w-]+)\)$/)
  if (variable) return resolve(values[variable[1]], values)
  const mix = value.match(/^color-mix\(in oklab, (var\(--[\w-]+\)) (\d+)%, (var\(--[\w-]+\))\)$/)
  if (!mix) throw new Error(`Unsupported color expression: ${value}`)
  const a = toLab(resolve(mix[1], values)), b = toLab(resolve(mix[3], values)), weight = Number(mix[2]) / 100
  return fromLab(a.map((v, i) => v * weight + b[i] * (1 - weight)) as Color)
}

const grades = ['a', 'b', 'c', 'd', 'f']
for (const theme of ['light', 'dark']) {
  describe(`${theme} grade tokens`, () => {
    const block = css.match(new RegExp(`:root\\[data-theme="${theme}"\\] \\{([^}]+)\\}`))![1]
    const values = tokens(block)
    const colors = grades.map(grade => resolve(values[`--grade-${grade}`], values))
    it('computes at least 4.5:1 against every report ground', () => {
      const rows = grades.map((grade, i) => {
        const ratios = ['--bg', '--surface', '--surface-raised'].map(bg => contrast(colors[i], resolve(values[bg], values)))
        for (const ratio of ratios) expect(ratio, `${theme} grade ${grade}`).toBeGreaterThanOrEqual(4.5)
        return { grade: grade.toUpperCase(), rgb: colors[i].map(c => Math.round(c * 255)).join(', '), bg: ratios[0].toFixed(2), surface: ratios[1].toFixed(2), raised: ratios[2].toFixed(2) }
      })
      console.table(rows)
    })
    it('keeps every grade perceptually distinct, including A and B', () => {
      const labs = colors.map(toLab)
      for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) {
        const distance = Math.hypot(...labs[i].map((v, k) => v - labs[j][k]))
        expect(distance, `${theme} grades ${grades[i]}/${grades[j]}`).toBeGreaterThan(0.04)
      }
    })
    it('keeps map lines, node borders and rail text readable', () => {
      const surfaces = ['--rail', '--bg', '--surface', '--surface-raised', '--surface-strong', '--field-bg']
      const pairs: [string, string[], number][] = [
        ['--edge-call', ['--bg', '--surface', '--surface-raised'], 3],
        ['--border-strong', surfaces, 3],
        ['--warn', ['--rail', '--bg', '--surface'], 4.5],
        ['--grade-b', ['--rail', '--surface-strong'], 4.5],
        ['--grade-d', ['--rail'], 4.5],
        ['--grade-f', ['--rail', '--surface-strong'], 4.5],
      ]
      const rows = []
      for (const [fg, grounds, min] of pairs) for (const bg of grounds) {
        const ratio = contrast(resolve(values[fg], values), resolve(values[bg], values))
        rows.push({ fg, bg, ratio: ratio.toFixed(2) })
        expect(ratio, `${theme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(min)
      }
      console.table(rows)
    })
    it('draws the taskbot node edge at 3:1 against the canvas and the node', () => {
      const border = css.match(/\.tb-node \{[^}]*border: 1px solid ([^;]+);/)![1]
      expect(border).toBe('var(--border-strong)')
      for (const ground of ['--bg', '--surface', '--surface-raised']) {
        const ratio = contrast(resolve(border, values), resolve(values[ground], values))
        expect(ratio, `${theme} node border on ${ground}`).toBeGreaterThanOrEqual(3.0)
      }
    })
    it('keeps the D and F grade chips readable on their tinted node heads', () => {
      for (const grade of ['D', 'F']) {
        const tint = css.match(new RegExp(`\\.tb-node\\.g-${grade} \\.tb-head, \\.tb-node\\.compact\\.g-${grade} \\{ background: ([^;]+); \\}`))![1]
        const ratio = contrast(resolve(values[`--grade-${grade.toLowerCase()}`], values), resolve(tint, values))
        expect(ratio, `${theme} grade ${grade} on its tint`).toBeGreaterThanOrEqual(4.5)
      }
    })
    it('draws the call handle and the legend call swatch like a call edge at rest, gold only when active', () => {
      expect(css).toMatch(/\.react-flow__edge\.edge-call path \{ stroke: var\(--border-strong\); stroke-width: 1\.5; \}/)
      expect(css).toMatch(/\.react-flow__edge\.edge-call\.active path \{ stroke: var\(--edge-call\); stroke-width: 2\.5; \}/)
      expect(css).toMatch(/\.call-handle \{[^}]*background: var\(--border-strong\)/)
      expect(css).toMatch(/\.leg-call \{[^}]*background: var\(--border-strong\)/)
    })
    it('keeps the system dark block equal to the explicit dark block', () => {
      if (theme !== 'dark') return
      const system = tokens(css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{([^}]+)\}/)![1])
      expect(system).toEqual(values)
    })
    it('draws F at least as strong as D: not lighter, and in dark not less saturated', () => {
      const [, , , d, f] = colors.map(toLab)
      expect(f[0], `${theme} F lightness`).toBeLessThanOrEqual(d[0])
      // light F is darker than D at the same chroma; dark F was the pale one
      if (theme === 'dark') expect(Math.hypot(f[1], f[2]), `${theme} F chroma`).toBeGreaterThanOrEqual(Math.hypot(d[1], d[2]))
    })
    it('uses the light tokens for print, on a white page', () => {
      if (theme !== 'light') return
      const print = tokens(css.match(/@media print \{\s*:root, :root\[data-theme\] \{([^}]+)\}/)![1])
      expect(print).toEqual({ ...values, '--bg': '#ffffff' })
    })
  })
}
