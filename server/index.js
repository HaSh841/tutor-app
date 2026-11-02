// Tiny session server: saves chat history by codename in server/data/sessions.json
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = 3001
const HOST = '127.0.0.1'   // only the Vite proxy on this computer talks to it

const dir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(dir, 'data')
const dataFile = path.join(dataDir, 'sessions.json')

fs.mkdirSync(dataDir, { recursive: true })

let sessions = {}
try {
  sessions = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
} catch {
  sessions = {}
}

// write to a temp file first, so a crash can never leave a half-written file
function persist() {
  const tmp = `${dataFile}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2))
  fs.renameSync(tmp, dataFile)
}

const validName = (name) => name.length <= 24 && /^[A-Z][A-Za-z]*-\d+$/.test(name)

// keeps only the fields we expect, and rejects anything strange
function cleanMessages(input) {
  if (!Array.isArray(input) || input.length > 1000) return null
  const out = []
  for (const m of input) {
    if (!m || (m.role !== 'user' && m.role !== 'bot')) return null
    if (typeof m.text !== 'string' || m.text.length > 50000) return null
    out.push({ id: Number.isFinite(m.id) ? m.id : out.length, role: m.role, text: m.text })
  }
  return out
}

const app = express()
app.use(express.json({ limit: '5mb' }))

// read a session
app.get('/api/session/:codename', (req, res) => {
  const name = req.params.codename
  if (!validName(name)) return res.status(400).json({ error: 'Invalid codename' })
  if (!Object.hasOwn(sessions, name)) return res.status(404).json({ error: 'Not found' })
  res.json({ codename: name, ...sessions[name] })
})

// save a session
app.put('/api/session/:codename', (req, res) => {
  const name = req.params.codename
  if (!validName(name)) return res.status(400).json({ error: 'Invalid codename' })

  const messages = cleanMessages(req.body?.messages)
  if (!messages) return res.status(400).json({ error: 'Invalid messages' })

  sessions[name] = { messages, updatedAt: new Date().toISOString() }
  try {
    persist()
  } catch (err) {
    console.error('Could not save sessions file:', err)
    return res.status(500).json({ error: 'Could not save' })
  }
  res.json({ ok: true })
})

app.listen(PORT, HOST, () => {
  console.log(`Session server running on http://${HOST}:${PORT}`)
})