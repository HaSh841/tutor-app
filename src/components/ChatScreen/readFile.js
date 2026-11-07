// Reads an uploaded file in the browser and returns { name, content, images, truncated }.
//   content: plain text found in the file (can be empty)
//   images:  up to MAX_IMAGES small pictures as data URLs (photos, graphs, pdf pages, pictures inside Word files)

const MAX_CHARS = 30000     // bigger files are cut so the request stays small
const MAX_IMAGES = 4        // pictures sent to the AI per file
const MAX_SIDE = 1400       // pictures are shrunk so their longest side is at most this many pixels

export const ACCEPT =
  '.txt,.md,.csv,.json,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.sql,.xml,.yml,.yaml,.sh,.tex,' +
  '.pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif,.bmp'

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i

// shrinks a picture and returns it as a small JPEG data URL (transparent areas become white)
async function shrinkImage(blob) {
  const bmp = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()

  return canvas.toDataURL('image/jpeg', 0.85)
}

// ---------- PDF: the text of every page, and the first pages drawn as pictures ----------
async function readPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  const images = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((it) => it.str).join(' '))

    // draw the first pages as pictures, so graphs and figures can be seen
    if (images.length < MAX_IMAGES) {
      try {
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(2, MAX_SIDE / Math.max(base.width, base.height))
        const viewport = page.getViewport({ scale })

        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        await page.render({ canvasContext: ctx, canvas, viewport }).promise
        images.push(canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        /* this page could not be drawn: the text is still used */
      }
    }
  }

  return { text: pages.join('\n\n'), images }
}

// ---------- Word: the text, and the pictures inside the document ----------
async function readDocx(file) {
  const mod = await import('mammoth/mammoth.browser')
  const mammoth = mod.default ?? mod
  const arrayBuffer = await file.arrayBuffer()

  const { value: text } = await mammoth.extractRawText({ arrayBuffer })

  const found = []
  await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (img) => {
        if (found.length < MAX_IMAGES) {
          const b64 = await img.read('base64')
          found.push(`data:${img.contentType};base64,${b64}`)
        }
        return { src: '' }
      }),
    }
  )

  const images = []
  for (const url of found) {
    try {
      images.push(await shrinkImage(await (await fetch(url)).blob()))
    } catch {
      /* a picture format the browser cannot show (for example .emf): skip it */
    }
  }

  return { text, images }
}

// ---------- Excel: every sheet as CSV ----------
async function readSheet(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer())
  const text = wb.SheetNames
    .map((n) => `# Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`)
    .join('\n\n')
  return { text, images: [] }
}

export async function readFile(file) {
  const name = file.name
  const lower = name.toLowerCase()
  let text = ''
  let images = []

  if (IMAGE_EXT.test(lower)) {
    images = [await shrinkImage(file)]
  } else if (lower.endsWith('.pdf')) {
    ;({ text, images } = await readPdf(file))
  } else if (lower.endsWith('.docx')) {
    ;({ text, images } = await readDocx(file))
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    ;({ text, images } = await readSheet(file))
  } else if (lower.endsWith('.doc')) {
    throw new Error('Old .doc files are not supported. Save it as .docx.')
  } else {
    text = await file.text()
  }

  text = text.trim()
  if (!text && !images.length) throw new Error('Nothing readable was found in that file.')

  const truncated = text.length > MAX_CHARS
  return {
    name,
    content: truncated ? text.slice(0, MAX_CHARS) : text,
    images: images.slice(0, MAX_IMAGES),
    truncated,
  }
}