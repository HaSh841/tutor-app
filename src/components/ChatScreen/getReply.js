// Talks to Google Gemini through the Vite proxy, so the API key never reaches the browser.
// `history` is the whole conversation so far: [{ id, role: 'user' | 'bot', text }]
// Returns the bot's reply as a string.

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export async function getReply(history) {
  // convert to the API format
  const all = history.map((m) => ({
    role: m.role === 'bot' ? 'assistant' : 'user',
    content: m.text,
  }))

  // drop the opening bot greeting: the conversation must start with a user message
  const firstUser = all.findIndex((m) => m.role === 'user')
  const messages = firstUser === -1 ? all : all.slice(firstUser)

  let lastStatus = 0

  for (let round = 0; round < 2; round++) {
    for (const model of MODELS) {
      const res = await fetch('/api/ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),   // give up after 30 seconds
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
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