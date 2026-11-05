// Talks to Google Gemini through the Vite proxy, so the API key never reaches the browser.
// `history` is the whole conversation so far: [{ id, role: 'user' | 'bot', text }]
// getReply returns the bot's reply as a string.
// getLesson (Tutoring Mode) returns a lesson object: { title, language, summary, code, notes, flow, result }

// tried in order; if one is overloaded, the next is used
// (if a name gives a 404, replace it with the exact name shown in AI Studio)
const MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest']

const SYSTEM_PROMPT =
  'You are Theresa, a friendly and knowledgeable tutor assistant. ' +
  'Explain things clearly, keep answers concise, and stay in a warm, calm tone. ' +
  'When the user asks for a file, put the full content in ONE fenced code block and briefly say what it is. ' +
  'For code, use the language name (python, javascript, html...). ' +
  'For a Word document use ```docx and for a PDF use ```pdf. Inside, write simple markdown only: ' +
  '"# " heading, "## " subheading, "- " bullets, and plain paragraphs. No tables, no images. ' +
  'For an Excel spreadsheet use ```xlsx and write CSV only: first row is the headers, ' +
  'one row per line, commas between cells, and wrap any cell containing a comma in double quotes.'

// Tutoring Mode: the answer must be one JSON object so the two boxes can be filled separately
const TUTOR_PROMPT =
  'You are Theresa, a patient and friendly coding tutor. The user asks you to teach or explain code. ' +
  'Reply with ONLY one JSON object: no markdown fences, no text before or after it. ' +
  'It must have exactly these keys: ' +
  '"title" (short lesson name), ' +
  '"language" (the programming language, one or two words), ' +
  '"summary" (one or two sentences saying what the code does), ' +
  '"code" (the complete raw code as one string, with \\n for new lines, no markdown fences, ' +
  'ideally under 40 lines), ' +
  '"notes" (an array of 3 to 6 short strings: everything the learner needs to know, such as ' +
  'syntax, instructions and concepts used, mention line numbers when helpful), ' +
  '"flow" (an array of 3 to 8 objects with "title" and "detail", in the exact order the code ' +
  'runs, from the start until the result; keep each one short), ' +
  '"result" (one sentence: what the code finally produces or returns, include a sample value if you can). ' +
  'If the user asks a follow-up, answer it with a new full lesson in the same format.'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// converts the history to the API format
function toApiMessages(history) {
  const all = history.map((m) => ({
    role: m.role === 'bot' ? 'assistant' : 'user',
    content: m.text,
  }))

  // drop the opening bot greeting: the conversation must start with a user message
  const firstUser = all.findIndex((m) => m.role === 'user')
  return firstUser === -1 ? all : all.slice(firstUser)
}

// sends the conversation to Gemini and returns the reply text
async function callModel(system, history) {
  const messages = toApiMessages(history)

  let lastStatus = 0

  for (let round = 0; round < 2; round++) {
    for (const model of MODELS) {
      const res = await fetch('/api/ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),   // give up after 30 seconds
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      })

      if (res.ok) {
        const data = await res.json()
        return data.choices?.[0]?.message?.content?.trim() || '...'
      }

      lastStatus = res.status
      console.error('AI error', res.status, model, await res.text())

      // only keep trying for "busy" errors; anything else won't fix itself
      if (res.status !== 503 && res.status !== 429) {
        throw new Error(`AI request failed (${res.status})`)
      }
    }
    await wait(1500)   // short pause before the second round
  }

  throw new Error(`AI is busy (${lastStatus})`)
}

// normal chat
export async function getReply(history) {
  return callModel(SYSTEM_PROMPT, history)
}

// ---------- Tutoring Mode ----------
const str = (v) => (typeof v === 'string' ? v.trim() : '')

// turns the model's text into a clean lesson object, or throws if it is not usable
function parseLesson(text) {
  // remove ```json fences if the model added them anyway
  const raw = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('The lesson was not JSON')

  const d = JSON.parse(raw.slice(start, end + 1))
  if (typeof d.code !== 'string' || !d.code.trim()) throw new Error('The lesson has no code')

  const list = (v) => (Array.isArray(v) ? v : [])

  return {
    title: str(d.title) || 'Lesson',
    language: str(d.language) || 'code',
    summary: str(d.summary),
    code: d.code.replace(/\s+$/, ''),
    notes: list(d.notes).map(str).filter(Boolean),
    flow: list(d.flow)
      .map((s) =>
        typeof s === 'string' ? { title: s.trim(), detail: '' } : { title: str(s?.title), detail: str(s?.detail) }
      )
      .filter((s) => s.title),
    result: str(d.result),
  }
}

export async function getLesson(history) {
  // only the latest exchange is needed for follow-ups, which keeps the request small
  const text = await callModel(TUTOR_PROMPT, history.slice(-6))
  return parseLesson(text)
}