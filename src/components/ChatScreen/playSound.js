// Plays a sound when the bot replies.
// Put your audio file in public/resources/ and change the path below.
const REPLY_SOUND = '/resources/reply1.mp3'

let audio   // created once and reused

export function playReplySound(volume = 0.6) {
  try {
    if (!audio) audio = new Audio(REPLY_SOUND)
    audio.volume = volume      // 0 (silent) to 1 (full)
    audio.currentTime = 0      // restart if it is still playing
    audio.play().catch(() => {})   // ignore errors, e.g. a missing file
  } catch {
    // never let a sound problem break the chat
  }
}