// Saves and loads chats by codename in the Firebase Realtime Database: sessions/<codename>

import { get, ref, serverTimestamp, update } from 'firebase/database'
import { db } from './firebase'
import { checkCodename } from './codename'
import { rememberTutorLocally } from './tutors'

const TIMEOUT_MS = 10000
const MAX_MESSAGES = 1000
const MAX_TEXT = 50000

// a codename must match the rules, so it can never become a strange database path
const valid = (name) => typeof name === 'string' && name.length <= 24 && checkCodename(name) === ''

// gives up when the database does not answer in time
const withTimeout = (promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ])

const sessionRef = (codename) => ref(db, `sessions/${codename}`)

// returns { ok: true, messages } | { ok: false, notFound: true } | { ok: false, offline: true }
export async function loadSession(codename) {
  if (!db) return { ok: false, offline: true }
  if (!valid(codename)) return { ok: false, notFound: true }

  try {
    const snap = await withTimeout(get(sessionRef(codename)))
    if (!snap.exists()) return { ok: false, notFound: true }

    const data = snap.val()

    // the tutor this session was started with (saved in the database, so any device gets it)
    if (typeof data?.tutorId === 'string') rememberTutorLocally(codename, data.tutorId)

    // Firebase hands lists back as arrays, or as objects when it has gaps
    const raw = data?.messages
    const list = Array.isArray(raw) ? raw : raw ? Object.values(raw) : []

    return {
      ok: true,
      messages: list
        .filter(Boolean)
        .map((m, i) => ({ id: Number.isFinite(m.id) ? m.id : i, role: m.role, text: String(m.text ?? '') })),
    }
  } catch (err) {
    console.error('Could not load the session:', err)
    return { ok: false, offline: true }
  }
}

// returns true when saved, false when it failed
export async function saveSession(codename, messages) {
  if (!db || !valid(codename)) return false

  try {
    // update (not set), so the saved tutor next to the messages stays
    await withTimeout(
      update(sessionRef(codename), {
        messages: messages.slice(-MAX_MESSAGES).map((m, i) => ({
          id: Number.isFinite(m.id) ? m.id : i,
          role: m.role,
          text: String(m.text ?? '').slice(0, MAX_TEXT),
        })),
        updatedAt: serverTimestamp(),
      })
    )
    return true
  } catch (err) {
    console.error('Could not save the session:', err)
    return false
  }
}

// returns true (taken), false (free), or null (the database is not reachable)
export async function sessionExists(codename) {
  const result = await loadSession(codename)
  if (result.ok) return true
  if (result.notFound) return false
  return null
}