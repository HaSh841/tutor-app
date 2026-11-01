import { useEffect, useState } from 'react';
import useParallax from '../../hooks/useParallax';
import { playVoice, stopVoice } from '../../hooks/playVoice';
import './SessionScreen.css';

const CHAR_MS = 45;          // time per letter at normal speed
const AUTO_DELAY_MS = 1800;  // pause before auto play moves to the next line
const SPEEDS = [2, 3, 4];

// voice files: line 1 plays line1.mp3, line 2 plays line2.mp3, and so on
const VOICE_DIR = '/resources/voice';
// optional: list exact paths to override the numbering, e.g. ['/resources/voice/hello.mp3', ...]
const VOICES = [
  '/resources/voice/line1.mp3',
  '/resources/voice/line2.mp3',
  '/resources/voice/line3.mp3',
  '/resources/voice/line4.mp3',
  '/resources/voice/line5.mp3',

];

const voiceFor = (i) => VOICES[i] ?? `${VOICE_DIR}/line${i + 1}.mp3`;

// returns an error message, or '' when the codename is accepted
function checkCodename(name) {
  if (!/^[A-Z]/.test(name)) {
    return 'Your codename must start with a capital letter.';
  }
  if (!/^[A-Z][A-Za-z]*-\d+$/.test(name)) {
    return 'After the name, add a dash and numbers, like Kal-017.';
  }
  return '';
}

export default function SessionScreen({
  character = '/resources/Civilight_Eterna.png',
  lines = [],
  voiceVolume = 1,                                // 0 to 1, comes from the SFX slider
  onBack,
  onCodename,                                     // called with the codename once confirmed
}) {
  const ref = useParallax();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);          // letters visible so far
  const [menuOpen, setMenuOpen] = useState(false);
  const [speed, setSpeed] = useState(1);          // 1 = normal, or 2, 3, 4
  const [auto, setAuto] = useState(false);
  const [voiceDoneIndex, setVoiceDoneIndex] = useState(-1);   // index of the line whose voice has finished

  const [codename, setCodename] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);   // showing "are you sure?"
  const [confirmed, setConfirmed] = useState(false);
  // 'auto' = shows by itself after the last line, 'leaving' = fading out, 'hidden' = closed
  const [boxState, setBoxState] = useState('auto');
  const [reopened, setReopened] = useState(false);       // reopening skips the intro pause

  const line = lines[index] ?? '';
  const done = shown >= line.length;
  const isLast = index >= lines.length - 1;
  const voiceDone = voiceDoneIndex === index;        // true once the current line's voice has ended

  // the codename box appears once the last line has finished typing
  const promptReady = Boolean(onCodename) && done && isLast;
  // after Cancel, clicking the screen on the last line brings the box back
  const canReopen = Boolean(onCodename) && isLast && boxState === 'hidden' && !confirmed;

  // voice: plays each time the dialog moves to a new line, and stops the previous one
  useEffect(() => {
    playVoice(voiceFor(index), {
      volume: voiceVolume,
      onEnd: () => setVoiceDoneIndex(index),
    });
    return () => stopVoice();
  }, [index, voiceVolume]);

  // typewriter
  useEffect(() => {
    if (done) return;
    const id = setInterval(
      () => setShown((n) => Math.min(n + 1, line.length)),
      CHAR_MS / speed
    );
    return () => clearInterval(id);
  }, [done, line, speed]);

  // auto play: after the line has typed AND its voice has ended, wait a moment, then go on
  useEffect(() => {
    if (!auto || !done || !voiceDone) return;

    const id = setTimeout(() => {
      if (isLast) {
        setAuto(false);              // reached the end, so auto play turns itself off
      } else {
        setIndex((i) => i + 1);
        setShown(0);
      }
    }, AUTO_DELAY_MS / speed);

    return () => clearTimeout(id);
  }, [auto, done, voiceDone, isLast, speed]);

  const handleScreenClick = (e) => {
    if (e.target.closest('.session__menu, .codename')) return;   // they have their own buttons
    if (menuOpen) {                                   // clicking elsewhere closes the menu
      setMenuOpen(false);
      return;
    }
    if (!done) {                                      // first click finishes the line
      setShown(line.length);
      return;
    }
    if (!isLast) {                                    // next click goes to the next line
      setIndex(index + 1);
      setShown(0);
      return;
    }
    if (canReopen) {                                  // last line: bring the codename box back
      setReopened(true);
      setBoxState('auto');
    }
  };

  const pickSpeed = (s) => setSpeed((cur) => (cur === s ? 1 : s));

  // OK button (or Enter): check the codename, then ask "are you sure?"
  const handleCodenameSubmit = (e) => {
    e.preventDefault();
    const name = codename.trim();
    const problem = checkCodename(name);
    if (problem) {
      setError(problem);
      return;
    }
    setCodename(name);
    setConfirming(true);
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setBoxState('leaving');          // the box fades out
    onCodename?.(codename);
  };

  // Cancel button (or Esc): fade the box out and go back to the session screen
  const handleCancel = () => setBoxState('leaving');

  // when the fade-out finishes, remove the box (and clear it if it was cancelled)
  const handleBoxAnimationEnd = (e) => {
    if (e.target !== e.currentTarget || e.animationName !== 'codename-out') return;
    setBoxState('hidden');
    if (!confirmed) {
      setCodename('');
      setError('');
      setConfirming(false);
    }
  };

  return (
    <section ref={ref} className="session" onClick={handleScreenClick}>
      <img className="session__character" src={character} alt="" draggable="false" />

      <div className="session__dialog">
        <p className="session__text">
          <span>{line.slice(0, shown)}</span>
          {/* invisible rest of the line, so the box doesn't resize while typing */}
          <span className="session__ghost">{line.slice(shown)}</span>
        </p>
        {done && (!isLast || canReopen) && (
          <span className="session__next" aria-hidden="true">▼</span>
        )}
      </div>

      {/* blurs the character and dialog while the menu is open */}
      <div className={`session__blur ${menuOpen ? 'session__blur--on' : ''}`} />

      <div className={`session__menu ${menuOpen ? 'session__menu--open' : ''}`}>
        <button
          className="session__burger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>

        <div className="session__stack">
          {/* 1. back */}
          <button className="session__bar" style={{ '--i': 0 }} onClick={onBack}>
            <span className="session__circle">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="9 5 16 12 9 19" />
              </svg>
            </span>
            <span className="session__bar-label">Back</span>
          </button>

          {/* 2. speed */}
          <div className="session__bar" style={{ '--i': 1 }}>
            <span className="session__bar-label">Speed</span>
            <div className="session__speeds">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`session__speed ${speed === s ? 'session__speed--on' : ''}`}
                  aria-pressed={speed === s}
                  onClick={() => pickSpeed(s)}
                >
                  x{s}
                </button>
              ))}
            </div>
          </div>

          {/* 3. auto play */}
          <button
            className="session__bar"
            style={{ '--i': 2 }}
            aria-pressed={auto}
            onClick={() => setAuto((a) => !a)}
          >
            <span className="session__bar-label">Auto Play</span>
            <span className={`session__state ${auto ? 'session__state--on' : ''}`}>
              {auto ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>

      {/* codename box: blurs everything behind it, including the menu */}
      {promptReady && boxState !== 'hidden' && (
        <div
          className={`codename ${boxState === 'leaving' ? 'codename--out' : ''}`}
          style={{ '--cd': reopened ? '0s' : '0.5s' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="codename-title"
          onAnimationEnd={handleBoxAnimationEnd}
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCancel();
          }}
        >
          <div className="codename__panel">
            <div className="codename__box">
              {!confirming ? (
                <form className="codename__step" onSubmit={handleCodenameSubmit} noValidate>
                  <h2 id="codename-title" className="codename__title">
                    Enter Your Codename
                  </h2>

                  <input
                    className="codename__input"
                    type="text"
                    value={codename}
                    onChange={(e) => {
                      setCodename(e.target.value);
                      setError('');
                    }}
                    placeholder="Name-000"
                    maxLength={24}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    aria-invalid={Boolean(error)}
                    aria-describedby="codename-hint"
                  />

                  <p
                    id="codename-hint"
                    className={`codename__hint ${error ? 'codename__hint--error' : ''}`}
                  >
                    {error || 'Capital letter first, then a dash and numbers (example: Kal-017).'}
                  </p>

                  <div className="codename__actions">
                    <button type="submit" className="codename__ok">
                      OK
                    </button>
                    <button
                      type="button"
                      className="codename__btn codename__btn--ghost"
                      onClick={handleCancel}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="codename__step">
                  <h2 id="codename-title" className="codename__title codename__title--warn">
                    Are you sure this was your codename?
                  </h2>

                  <p className="codename__name">{codename}</p>

                  <div className="codename__actions">
                    <button className="codename__btn" onClick={handleConfirm}>
                      Yes
                    </button>
                    <button
                      className="codename__btn codename__btn--ghost"
                      onClick={() => setConfirming(false)}
                    >
                      No
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}