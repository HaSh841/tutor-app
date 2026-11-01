// Plays one voice line at a time. Starting a new line stops the previous one.
let current = null

export function playVoice(src, { volume = 1, onEnd } = {}) {
  stopVoice()

  // no voice for this line: report "finished" right away so nothing waits for it
  if (!src) {
    onEnd?.()
    return
  }

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    onEnd?.()
  }

  try {
    const audio = new Audio(src)
    audio.volume = volume                  // 0 (silent) to 1 (full)
    audio.addEventListener('ended', finish)
    audio.addEventListener('error', finish)   // missing file: don't block Auto Play

    current = {
      stop() {
        finished = true                    // a stopped clip never reports "finished"
        audio.pause()
      },
    }
    audio.play().catch(finish)             // blocked or missing audio: don't block Auto Play
  } catch {
    finish()
  }
}

export function stopVoice() {
  current?.stop()
  current = null
}