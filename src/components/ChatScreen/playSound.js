// Plays a random reply sound each time the bot replies.
// Put your audio files in public/resources/ and list their names below.
const REPLY_SOUNDS = [
  '/resources/reply1.mp3',
  '/resources/reply2.mp3',
  '/resources/reply3.mp3',
]

// create each Audio once so it is ready to play instantly
const clips = REPLY_SOUNDS.map((src) => new Audio(src))
let lastIndex = -1

export function playReplySound(volume = 0.6) {
  try {
    if (!clips.length) return

    // pick a random sound, but never the same one twice in a row
    let i = Math.floor(Math.random() * clips.length)
    if (clips.length > 1 && i === lastIndex) i = (i + 1) % clips.length
    lastIndex = i

    // stop any clip that is still playing, so sounds don't overlap
    clips.forEach((c) => {
      c.pause()
      c.currentTime = 0
    })

    const clip = clips[i]
    clip.volume = volume       // 0 (silent) to 1 (full)
    clip.play().catch(() => {})   // ignore errors, e.g. a missing file
  } catch {
    // never let a sound problem break the chat
  }
}