// Builds Word and PDF files that contain a drawn graph.
//
// Chat: the AI writes ONE line like  [[graph: {"title":..., "curves":[...], "points":[...]}]]
// inside a ```docx or ```pdf block. That line is turned into a real picture of the graph.
// Tutoring Mode: downloadLesson() puts the whole math lesson (problem, graph, solution, answer) in a file.
// Any other file goes to the normal saveBlock from downloadFile.js, unchanged.
import { build, W, H, PAD } from './graphMath'
import { saveBlock } from './downloadFile'

const INK = ['#1f5fbf', '#d9822b', '#2a9d8f']         // curve colors that work on white paper
const HAS_GRAPH = /^\s*\[\[graph:/m
const GRAPH_LINE = /^\[\[graph:\s*(\{.*\})\s*\]\]$/

// ---------- cleaning the graph data (same rules as the lesson's graph) ----------
const str = (v) => (typeof v === 'string' ? v.trim() : '')
const list = (v) => (Array.isArray(v) ? v : [])
const num = (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function cleanGraph(g) {
  if (!g || typeof g !== 'object') return null
  const curves = list(g.curves)
    .slice(0, 3)
    .map((c) => ({ label: str(c?.label), expr: str(c?.expr) }))
    .filter((c) => c.expr)
  const points = list(g.points)
    .slice(0, 8)
    .map((p) => ({ x: num(p?.x), y: num(p?.y), label: str(p?.label) }))
    .filter((p) => p.x !== null && p.y !== null)
  if (!curves.length && !points.length) return null
  return {
    title: str(g.title),
    xMin: num(g.xMin),
    xMax: num(g.xMax),
    yMin: num(g.yMin),
    yMax: num(g.yMax),
    curves,
    points,
  }
}

// ---------- drawing the graph as a PNG picture (black on white, for paper) ----------
async function graphToPng(graph) {
  const d = await build(graph)
  const hasCurve = d.curves.some((c) => c.paths.length)
  if (!hasCurve && !d.points.length) throw new Error('nothing to draw')

  const S = 2                                       // sharper picture
  const legendH = hasCurve ? 24 : 0
  const bottom = H - PAD.b
  const right = W - PAD.r

  const canvas = document.createElement('canvas')
  canvas.width = W * S
  canvas.height = (H + legendH) * S
  const ctx = canvas.getContext('2d')
  ctx.scale(S, S)

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H + legendH)

  // grid
  ctx.strokeStyle = '#e1e4e8'
  ctx.lineWidth = 1
  d.xt.forEach((t) => {
    ctx.beginPath(); ctx.moveTo(t.p, PAD.t); ctx.lineTo(t.p, bottom); ctx.stroke()
  })
  d.yt.forEach((t) => {
    ctx.beginPath(); ctx.moveTo(PAD.l, t.p); ctx.lineTo(right, t.p); ctx.stroke()
  })

  // axes
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 1.4
  if (d.x0 !== null) { ctx.beginPath(); ctx.moveTo(d.x0, PAD.t); ctx.lineTo(d.x0, bottom); ctx.stroke() }
  if (d.y0 !== null) { ctx.beginPath(); ctx.moveTo(PAD.l, d.y0); ctx.lineTo(right, d.y0); ctx.stroke() }

  // numbers
  ctx.fillStyle = '#444'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  d.xt.forEach((t) => ctx.fillText(String(t.v), t.p, bottom + 16))
  ctx.textAlign = 'right'
  d.yt.forEach((t) => ctx.fillText(String(t.v), PAD.l - 6, t.p + 4))

  // curves (cut off at the edge of the plot)
  ctx.save()
  ctx.beginPath()
  ctx.rect(PAD.l, PAD.t, right - PAD.l, bottom - PAD.t)
  ctx.clip()
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  d.curves.forEach((c, i) => {
    ctx.strokeStyle = INK[i % INK.length]
    c.paths.forEach((p) => ctx.stroke(new Path2D(p)))
  })
  ctx.restore()

  // marked points with their labels
  ctx.font = '11px sans-serif'
  d.points.forEach((p) => {
    ctx.fillStyle = '#c0392b'
    ctx.beginPath(); ctx.arc(p.px, p.py, 4, 0, Math.PI * 2); ctx.fill()

    const label = p.label || `(${p.x}, ${p.y})`
    const ty = Math.min(Math.max(p.py < PAD.t + 18 ? p.py + 18 : p.py - 9, PAD.t + 10), bottom - 6)
    ctx.textAlign = p.px > W - 70 ? 'right' : p.px < PAD.l + 40 ? 'left' : 'center'
    ctx.lineWidth = 3
    ctx.strokeStyle = '#fff'
    ctx.strokeText(label, p.px, ty)
    ctx.fillStyle = '#111'
    ctx.fillText(label, p.px, ty)
  })

  // legend under the plot
  if (hasCurve) {
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    let x = PAD.l
    d.curves.forEach((c, i) => {
      if (!c.paths.length) return
      ctx.strokeStyle = INK[i % INK.length]
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(x, H + 10); ctx.lineTo(x + 14, H + 10); ctx.stroke()
      ctx.fillStyle = '#222'
      ctx.fillText(c.label, x + 20, H + 14)
      x += 20 + ctx.measureText(c.label).width + 18
    })
  }

  return { url: canvas.toDataURL('image/png'), width: W, height: H + legendH }
}

// ---------- reading the simple markdown the AI writes ----------
const plain = (s) => s.replace(/\*\*|__/g, '').trim()

function parseBlocks(md) {
  const blocks = []
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    const g = line.match(GRAPH_LINE)
    if (g) blocks.push({ type: 'graph', json: g[1] })
    else if (line.startsWith('## ')) blocks.push({ type: 'h2', text: plain(line.slice(3)) })
    else if (line.startsWith('# ')) blocks.push({ type: 'h1', text: plain(line.slice(2)) })
    else if (/^[-*]\s+/.test(line)) blocks.push({ type: 'li', text: plain(line.replace(/^[-*]\s+/, '')) })
    else blocks.push({ type: 'p', text: plain(line) })
  }
  return blocks
}

// turns every graph line into a picture (or a short note if it cannot be drawn)
async function resolveGraphs(blocks) {
  const out = []
  for (const b of blocks) {
    if (b.type !== 'graph') { out.push(b); continue }
    try {
      const graph = cleanGraph(JSON.parse(b.json))
      if (!graph) throw new Error('empty graph')
      out.push({ type: 'graph', title: graph.title, ...(await graphToPng(graph)) })
    } catch {
      out.push({ type: 'p', text: '(The graph could not be drawn.)' })
    }
  }
  return out
}

// ---------- helpers ----------
const bytesOf = (dataUrl) => {
  const bin = atob(dataUrl.split(',')[1])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

const nameOf = (blocks) => {
  const h = blocks.find((b) => b.type === 'h1')
  const slug = (h?.text || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug.slice(0, 40) || 'document'
}

// the standard PDF fonts only know Latin letters: swap the common math symbols
const pdfSafe = (s) =>
  s
    .replace(/[−–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/∫/g, 'integral')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/∞/g, 'infinity')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------- Word ----------
async function makeDocx(blocks) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = await import('docx')

  const children = []
  for (const b of blocks) {
    if (b.type === 'h1') {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(b.text)] }))
    } else if (b.type === 'h2') {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.text)] }))
    } else if (b.type === 'li') {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b.text)] }))
    } else if (b.type === 'graph') {
      const w = 440
      const h = Math.round((w * b.height) / b.width)
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [
            new ImageRun({
              type: 'png',
              data: bytesOf(b.url),
              transformation: { width: w, height: h },
              altText: { title: b.title || 'Graph', description: b.title || 'Graph', name: 'graph' },
            }),
          ],
        })
      )
      if (b.title) {
        children.push(
          new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: b.title, italics: true, size: 20 })] })
        )
      }
    } else {
      children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun(b.text)] }))
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 24 } } } },
    sections: [{ children }],
  })
  return Packer.toBlob(doc)
}

// ---------- PDF ----------
async function makePdf(blocks) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })

  const M = 56
  const pw = pdf.internal.pageSize.getWidth()
  const ph = pdf.internal.pageSize.getHeight()
  const maxW = pw - M * 2
  let y = M

  const need = (h) => {
    if (y + h > ph - M) {
      pdf.addPage()
      y = M
    }
  }

  const write = (text, size, bold, indent = 0, after = 6) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    const lh = size * 1.35
    pdf.splitTextToSize(pdfSafe(text), maxW - indent).forEach((line) => {
      need(lh)
      pdf.text(line, M + indent, y + size)
      y += lh
    })
    y += after
  }

  for (const b of blocks) {
    if (b.type === 'h1') write(b.text, 20, true, 0, 10)
    else if (b.type === 'h2') { y += 6; write(b.text, 14, true, 0, 6) }
    else if (b.type === 'li') write(`- ${b.text}`, 11, false, 10, 3)
    else if (b.type === 'graph') {
      const w = Math.min(maxW, 420)
      const h = (w * b.height) / b.width
      need(h + 24)
      pdf.addImage(b.url, 'PNG', M, y, w, h)
      y += h + 6
      if (b.title) write(b.title, 9, false, 0, 10)
    } else write(b.text, 11, false, 0, 6)
  }

  return pdf.output('blob')
}

// ---------- public functions ----------
async function buildAndSave(format, markdown) {
  const blocks = await resolveGraphs(parseBlocks(markdown))
  const blob = format === 'pdf' ? await makePdf(blocks) : await makeDocx(blocks)
  download(blob, `${nameOf(blocks)}.${format}`)
}

// use this instead of saveBlock: Word/PDF files with a graph line are built here, everything else as before
export async function saveFile(lang, content) {
  const l = String(lang || '').toLowerCase()
  if ((l === 'docx' || l === 'pdf') && HAS_GRAPH.test(content)) {
    return buildAndSave(l, content)
  }
  return saveBlock(lang, content)
}

// Tutoring Mode (math): the whole lesson as a Word or PDF file, with its graph and answer
export async function downloadLesson(lesson, format) {
  const lines = [`# ${lesson.title}`]

  if (lesson.summary) lines.push(lesson.summary)

  if (lesson.problem) {
    lines.push('## Problem', ...lesson.problem.split('\n'))
  }

  if (lesson.graph) {
    lines.push('## Graph', `[[graph: ${JSON.stringify(lesson.graph)}]]`)
  }

  lines.push('## Solution', ...lesson.code.split('\n').filter((l) => l.trim()))

  if (lesson.answer) lines.push('## Answer', lesson.answer)

  if (lesson.notes?.length) {
    lines.push('## Key points', ...lesson.notes.map((n) => `- ${n}`))
  }

  return buildAndSave(format, lines.join('\n'))
}