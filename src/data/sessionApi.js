// Talks to the session server (through the Vite proxy) to save and load chats by codename.

const BASE = '/api/session'
const url = (codename) => `${BASE}/${encodeURIComponent(codename)}`

// returns { ok: true, messages } | { ok: false, notFound: true } | { ok: false, offline: true }
export async function loadSession(codename) {
  try {
    const res = await fetch(url(codename), { signal: AbortSignal.timeout(10000) })
    if (res.status === 404) return { ok: false, notFound: true }
    if (!res.ok) return { ok: false, offline: true }
    const data = await res.json()
    return { ok: true, messages: Array.isArray(data.messages) ? data.messages : [] }
  } catch {
    return { ok: false, offline: true }
  }
}

// returns true when saved, false when it failed
export async function saveSession(codename, messages) {
  try {
    const res = await fetch(url(codename), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text })),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// returns true (taken), false (free), or null (server not reachable)
export async function sessionExists(codename) {
  const result = await loadSession(codename)
  if (result.ok) return true
  if (result.notFound) return false
  return null
}