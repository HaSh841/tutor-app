import { useEffect, useRef, useState } from 'react';
import useParallax from '../../hooks/useParallax';
import { getReply, getLesson } from './getReply';
import { splitReply, extFor, saveBlock } from './downloadFile';
import { saveFile, downloadLesson } from './exportDocument';
import { playReplySound } from './playSound';
import { saveSession } from '../../data/sessionApi';
import { getTutor } from '../../data/tutors';
import { kindOf } from './LessonKind';
import GraphButton from './GraphButton';
import SampleBox from './SampleBox';
import AttachControl from './AttachControl';
import LoadPrompt from '../LoadPrompt/LoadPrompt';
import './ChatScreen.css';

const CHIBI_MS = 3000;                      // how long the chibi stays on screen after a reply

// Tutoring Mode transition (keep these in step with the 0.8s slide in ChatScreen.css)
const SLIDE_MS = 800;                       // a box sliding out of or into the screen
const SHUTTER_MS = 900;                     // the top and bottom panels closing, then opening
const ENTER_MS = SLIDE_MS + 300;            // slide in, including the small delay of the lower box

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// the next free message id after a loaded history
const nextIdFor = (list) =>
  list?.length ? Math.max(...list.map((m) => m.id ?? 0)) + 1 : 1;

export default function ChatScreen({
  tutor = getTutor(),                            // the chosen tutor (see data/tutors.js)
  codename = '',
  initialMessages = null,                        // a loaded session's history, or null for a new chat
  initialTutorHistory = null,                    // a loaded session's Tutoring Mode history, or null
  onHome,                                        // called when the Home bar is pressed
  onLoadSession,                                 // async (codename) => '' on success, or an error message
}) {
  const ref = useParallax();
  const kind = kindOf(tutor);                    // 'math' or 'code'
  const listRef = useRef(null);
  const idRef = useRef(nextIdFor(initialMessages));   // next message id
  const videoRef = useRef(null);                 // the chibi video
  const chibiTimer = useRef(null);               // hides the chibi after CHIBI_MS
  const pauseTimer = useRef(null);               // pauses the video once it has faded out
  const timers = useRef([]);                     // timers of the Tutoring Mode transition
  const transRef = useRef(false);                // true while the Tutoring Mode transition runs
  const tutorIdRef = useRef(nextIdFor(initialTutorHistory));   // next tutoring message id
  const startedRef = useRef(false);              // makes sure the first save only happens once
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);       // the "load session" box
  const [messages, setMessages] = useState(() =>
    initialMessages?.length
      ? initialMessages
      : [
          {
            id: 0,
            role: 'bot',
            text: tutor.greeting(codename),
          },
        ]
  );
  const [draft, setDraft] = useState('');
  const [attached, setAttached] = useState(null);        // file waiting to be sent in the chat
  const [waiting, setWaiting] = useState(false);   // true while the bot is "typing"
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState([]);      // created files not downloaded yet
  const [chibiOn, setChibiOn] = useState(false);   // true while the chibi is showing
  const [saveState, setSaveState] = useState('idle');   // 'idle', 'saved' or 'failed'

  // ---------- Tutoring Mode ----------
  const [mode, setMode] = useState('chat');              // 'chat' or 'tutor'
  // each box is 'intro' (first start), 'hidden', 'enter', 'shown' or 'leave'
  const [chatState, setChatState] = useState('intro');
  const [tutorState, setTutorState] = useState('hidden');
  const [curtain, setCurtain] = useState('off');         // 'off', 'close' or 'open'
  // a loaded session: the current lesson is the last tutor reply (it is saved as JSON text)
  const [lesson, setLesson] = useState(() => {
    const last = [...(initialTutorHistory || [])].reverse().find((m) => m.role === 'bot');
    try {
      return last ? JSON.parse(last.text) : null;
    } catch {
      return null;
    }
  });
  const [lessonN, setLessonN] = useState(initialTutorHistory?.length ? 1 : 0);   // changes with each lesson (resets the scroll)
  const [tutorHistory, setTutorHistory] = useState(initialTutorHistory || []);  // what the tutor and the user said
  const tutorHistoryRef = useRef(initialTutorHistory || []);   // always the latest, so saves never use an old copy
  const [tutorDraft, setTutorDraft] = useState('');
  const [tutorAttached, setTutorAttached] = useState(null);   // file waiting to be sent in Tutoring Mode
  const [tutorWaiting, setTutorWaiting] = useState(false);
  const [tutorError, setTutorError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);   // the sample input / output box (coding tutor)
  const [sampleSeen, setSampleSeen] = useState(false);   // true once the hopping box was clicked

  // coding tutor: the sample runs of the current lesson, and whether the hopping box shows
  const samples = kind === 'code' && lesson ? lesson.samples : [];
  const showSample = mode === 'tutor' && !tutorWaiting && samples.length > 0;

  // math tutor: the graph of the current lesson (null hides the hopping graph button)
  const graph = kind === 'math' && mode === 'tutor' && !tutorWaiting && lesson ? lesson.graph : null;

  useEffect(() => {
    tutorHistoryRef.current = tutorHistory;
  }, [tutorHistory]);

  // keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, waiting]);

  // clear the timers when leaving the screen
  useEffect(
    () => () => {
      clearTimeout(chibiTimer.current);
      clearTimeout(pauseTimer.current);
      timers.current.forEach(clearTimeout);
    },
    []
  );

  // clicking anywhere outside the menu closes it
  const handleScreenClick = (e) => {
    if (menuOpen && !e.target.closest('.session__menu')) setMenuOpen(false);
  };

  // saves the whole chat on the server under the codename (pictures are left out: they are too big)
  const persist = async (list, tutorList = tutorHistoryRef.current) => {
    if (!codename) return;
    const slimmer = (l) =>
      l.map((m) => (m.file?.images?.length ? { ...m, file: { ...m.file, images: [] } } : m));
    const ok = await saveSession(codename, slimmer(list), slimmer(tutorList));
    setSaveState(ok ? 'saved' : 'failed');
  };

  // a brand new session is saved right away, so its codename exists even if the user
  // only uses Tutoring Mode and never sends a normal chat message
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (initialMessages?.length || !codename) return;      // a loaded session is already saved
    saveSession(codename, messages).then((ok) => setSaveState(ok ? 'saved' : 'failed'));
  }, [codename, initialMessages, messages]);

  // Load Session bar: close the menu and ask for a codename
  const openLoad = () => {
    setMenuOpen(false);
    setLoadOpen(true);
  };

  // runs fn after ms, and remembers the timer so it can be cleared
  const later = (fn, ms) => {
    timers.current.push(setTimeout(fn, ms));
  };

  // Tutoring Mode bar: the current box slides out to the right, the top and bottom panels
  // close and open, then the other screen slides in from the right
  const toggleTutor = () => {
    setMenuOpen(false);
    if (transRef.current) return;                 // ignore clicks while it is running
    transRef.current = true;

    const toTutor = mode === 'chat';
    const setOld = toTutor ? setChatState : setTutorState;
    const setNew = toTutor ? setTutorState : setChatState;

    setOld('leave');                                          // 1. the current box slides out

    later(() => setCurtain('close'), SLIDE_MS);               // 2. the panels close

    later(() => {                                             // 3. fully black: swap the screens
      setOld('hidden');
      setMode(toTutor ? 'tutor' : 'chat');
      setSampleOpen(false);                                   //    the sample box closes
      setCurtain('open');                                     //    the panels open again
    }, SLIDE_MS + SHUTTER_MS);

    later(() => {                                             // 4. open: the new box slides in
      setCurtain('off');
      setNew('enter');
    }, SLIDE_MS + SHUTTER_MS * 2);

    later(() => {
      setNew('shown');
      transRef.current = false;
    }, SLIDE_MS + SHUTTER_MS * 2 + ENTER_MS);
  };

  // the hopping box beside the character: opens and closes the sample input / output
  const toggleSamples = () => {
    setSampleSeen(true);                          // it stops hopping once it was clicked
    setSampleOpen((o) => !o);
  };

  // asks the tutor to teach something (optionally about an attached file); the answer fills the boxes
  const handleTutorSend = async (e) => {
    e.preventDefault();
    const file = tutorAttached;
    const text =
      tutorDraft.trim() || (file ? 'Please read this file and teach me what it does.' : '');
    if (!text || tutorWaiting) return;

    const before = tutorHistory;
    const next = [
      ...before,
      { id: tutorIdRef.current++, role: 'user', text, ...(file && { file }) },
    ];
    setTutorHistory(next);
    setTutorDraft('');
    setTutorAttached(null);
    setTutorWaiting(true);
    setTutorError('');

    try {
      const result = await getLesson(next, tutor);
      setLesson(result);
      setLessonN((n) => n + 1);
      setSampleOpen(false);                       // a new lesson: the sample box starts closed
      setSampleSeen(false);                       // and the box hops again
      const withLesson = [
        ...next,
        { id: tutorIdRef.current++, role: 'bot', text: JSON.stringify(result) },
      ];
      setTutorHistory(withLesson);
      setConnected(true);
      persist(messages, withLesson);              // saves the chat and the tutoring history
      playReplySound();
      showChibi();
    } catch (err) {
      setTutorHistory(before);                    // forget the request that failed
      setTutorError(
        err?.offTopic ? err.message : 'I could not build that lesson. Please try again.'
      );
    } finally {
      setTutorWaiting(false);
    }
  };

  // copies the lesson's code
  const handleCopy = async () => {
    if (!lesson) return;
    try {
      await navigator.clipboard.writeText(lesson.code);
      setCopied(true);
      later(() => setCopied(false), 1500);
    } catch {
      /* clipboard not allowed: nothing to do */
    }
  };

  // downloads the lesson: math as a Word or PDF file with its graph and answer, code as a code file
  const handleDownload = (format) => {
    if (!lesson) return;
    if (kind === 'math') downloadLesson(lesson, format);
    else saveBlock((lesson.language || 'txt').toLowerCase(), lesson.code);
  };

  // chibi appears and hops, then disappears after CHIBI_MS (skipped if the tutor has no chibi)
  const showChibi = () => {
    if (!tutor.chibi) return;
    clearTimeout(chibiTimer.current);
    clearTimeout(pauseTimer.current);

    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setChibiOn(true);

    chibiTimer.current = setTimeout(() => {
      setChibiOn(false);
      // pause the video once the fade-out has finished
      pauseTimer.current = setTimeout(() => videoRef.current?.pause(), 450);
    }, CHIBI_MS);
  };

  // clicking the hopping icon downloads every waiting file, then the icon goes away
  const handleHopClick = async () => {
    const files = pending;
    setPending([]);
    for (const f of files) {
      await saveFile(f.lang, f.content);
      await wait(300);                           // small gap so the browser allows several downloads
    }
  };

  // clicking a Download button inside the chat also clears that file from the waiting list
  const handleBubbleDownload = (part) => {
    saveFile(part.lang, part.content);
    setPending((p) => p.filter((f) => f.content !== part.content));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const file = attached;
    const text = draft.trim() || (file ? 'Please read this file and tell me what is in it.' : '');
    if (!text || waiting) return;

    const next = [
      ...messages,
      { id: idRef.current++, role: 'user', text, ...(file && { file }) },
    ];
    setMessages(next);
    setDraft('');
    setAttached(null);
    setWaiting(true);

    try {
      const reply = await getReply(next, tutor);

      // the reply contains file(s): the icon hops until they are downloaded
      const files = splitReply(reply)
        .filter((p) => p.type === 'code')
        .map((p) => ({ lang: p.lang, content: p.content }));
      if (files.length) setPending(files);

      const withReply = [...next, { id: idRef.current++, role: 'bot', text: reply }];
      setConnected(true);
      setMessages(withReply);
      persist(withReply);                        // save the chat under the codename
      playReplySound();                          // random sound when the bot replies
      showChibi();                               // chibi hops in for 3 seconds
    } catch {
      setMessages((m) => [
        ...m,
        { id: idRef.current++, role: 'bot', text: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setWaiting(false);
    }
  };

  const saveNote =
    saveState === 'saved' ? ' · Saved' : saveState === 'failed' ? ' · Not saved (server offline)' : '';

  return (
    <section ref={ref} className="chat" onClick={handleScreenClick}>
      {/* character: fades in on the left */}
      <div className="chat__character">
        <img src={tutor.image} alt="" draggable="false" />

        {/* file icon: hops near the head until it is clicked */}
        <button
          type="button"
          className={`chat__hop ${pending.length ? 'chat__hop--on' : ''}`}
          onClick={handleHopClick}
          aria-label="Download the created file"
          tabIndex={pending.length ? 0 : -1}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 3h7l5 5v13H7z" />
            <path d="M14 3v5h5" />
            <line x1="10" y1="13" x2="16" y2="13" />
            <line x1="10" y1="17" x2="16" y2="17" />
          </svg>
          {pending.length > 1 && <span className="chat__hop-count">{pending.length}</span>}
        </button>

        {/* coding tutor: a box hops beside the character; click it to see the sample input and output */}
        {kind === 'code' && (
          <div className={`chat__samples-anchor ${showSample ? 'chat__samples-anchor--on' : ''}`}>
            <button
              type="button"
              className={`chat__sample-btn ${
                showSample && !sampleSeen ? 'chat__sample-btn--hop' : ''
              } ${sampleOpen ? 'chat__sample-btn--open' : ''}`}
              onClick={toggleSamples}
              aria-label="Show sample input and output"
              aria-expanded={sampleOpen}
              tabIndex={showSample ? 0 : -1}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="5 8 10 12 5 16" />
                <line x1="12" y1="17" x2="19" y2="17" />
              </svg>
            </button>

            {showSample && sampleOpen && (
              <SampleBox key={lessonN} samples={samples} onClose={() => setSampleOpen(false)} />
            )}
          </div>
        )}

        {/* math tutor: a box hops beside the character; click it to pop up the graph */}
        {kind === 'math' && <GraphButton key={lessonN} graph={graph} />}
      </div>

      {/* chat box: slides in from the right */}
      <div
        className={`chat__dock chat__dock--${chatState}`}
        aria-hidden={mode !== 'chat'}
      >
        <div className="chat__panel chat__slide">
          <header className="chat__header">
            <div>
              <h2 className="chat__title">{tutor.name}</h2>
              {codename && (
                <p className="chat__sub">
                  Codename: {codename}
                  {saveNote}
                </p>
              )}
            </div>
            <span className="chat__status">
              {connected ? 'Connected to DWDB-221E' : 'Cant connect to the neural network'}
            </span>
          </header>

          <ul className="chat__list" ref={listRef}>
            {messages.map((m) => (
              <li key={m.id} className={`chat__msg chat__msg--${m.role}`}>
                <div className="chat__bubble">
                  {m.file && <span className="chat__file">File: {m.file.name}</span>}
                  {splitReply(m.text).map((part, i) =>
                    part.type === 'code' ? (
                      <div key={i} className="chat__code">
                        <pre><code>{part.content}</code></pre>
                        <button
                          type="button"
                          className="chat__download"
                          onClick={() => handleBubbleDownload(part)}
                        >
                          Download .{extFor(part.lang)}
                        </button>
                      </div>
                    ) : (
                      <span key={i} className="chat__text">{part.content}</span>
                    )
                  )}
                </div>
              </li>
            ))}

            {waiting && (
              <li className="chat__msg chat__msg--bot">
                <p className="chat__bubble chat__typing" aria-label="typing">
                  <span />
                  <span />
                  <span />
                </p>
              </li>
            )}
          </ul>

          <form className="chat__form" onSubmit={handleSend}>
            <AttachControl file={attached} onChange={setAttached} />
            <input
              className="chat__input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message..."
              autoComplete="off"
              aria-label="Message"
            />
            <button
              type="submit"
              className="chat__send"
              disabled={(!draft.trim() && !attached) || waiting}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="13 6 19 12 13 18" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Tutoring Mode: code box on top, flow box below, replacing the chat box */}
      <div
        className={`chat__dock chat__dock--tutor chat__dock--${tutorState}`}
        aria-hidden={mode !== 'tutor'}
      >
        <div className="tutor">
          {/* upper box: the raw code (coding tutor) or problem, solution and answer (math tutor) */}
          <section className="tutor__box tutor__box--code chat__slide">
            <header className="tutor__head">
              <h3 className="tutor__title">{lesson ? lesson.title : 'Tutoring Mode'}</h3>
              <span className="tutor__tag">{lesson ? lesson.language : tutor.tutoringTag}</span>
              {lesson && (
                <>
                  <button type="button" className="tutor__copy" onClick={handleCopy}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  {kind === 'math' ? (
                    <>
                      <button type="button" className="tutor__copy" onClick={() => handleDownload('docx')}>
                        Word
                      </button>
                      <button type="button" className="tutor__copy" onClick={() => handleDownload('pdf')}>
                        PDF
                      </button>
                    </>
                  ) : (
                    <button type="button" className="tutor__copy" onClick={() => handleDownload()}>
                      Download
                    </button>
                  )}
                </>
              )}
            </header>

            <div className="tutor__scroll" key={lessonN}>
              {tutorWaiting ? (
                <p className="chat__typing" aria-label="typing">
                  <span />
                  <span />
                  <span />
                </p>
              ) : lesson ? (
                <>
                  {lesson.summary && <p className="tutor__summary">{lesson.summary}</p>}

                  {/* math tutor: the problem to solve */}
                  {kind === 'math' && lesson.problem && (
                    <div className="tutor__problem">
                      <h4 className="tutor__sub">Problem</h4>
                      <p className="tutor__problem-text">{lesson.problem}</p>
                    </div>
                  )}

                  {kind === 'math' && <h4 className="tutor__sub tutor__sub--first">Solution</h4>}

                  <pre className="tutor__code">
                    <code className="tutor__code-inner">
                      {lesson.code.split('\n').map((line, i) => (
                        <span key={i} className="tutor__line">
                          <span className="tutor__ln">{i + 1}</span>
                          <span>{line || ' '}</span>
                        </span>
                      ))}
                    </code>
                  </pre>

                  {/* math tutor: the final answer (the graph lives in the hopping box) */}
                  {kind === 'math' && lesson.answer && (
                    <div className="tutor__answer">
                      <span className="tutor__answer-label">Answer</span>
                      <strong>{lesson.answer}</strong>
                    </div>
                  )}

                  {lesson.notes.length > 0 && (
                    <>
                      <h4 className="tutor__sub">Key points</h4>
                      <ul className="tutor__notes">
                        {lesson.notes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <p className="tutor__empty">{tutor.emptyCode}</p>
              )}
              {tutorError && <p className="tutor__error">{tutorError}</p>}
            </div>
          </section>

          {/* lower box: the flow until the result */}
          <section
            className="tutor__box tutor__box--flow chat__slide"
            style={{ '--d': '0.15s' }}
          >
            <header className="tutor__head">
              <h3 className="tutor__title">Flow</h3>
              <span className="tutor__tag">Step by step</span>
            </header>

            <div className="tutor__scroll" key={lessonN}>
              {!tutorWaiting && lesson ? (
                <ol className="tutor__flow">
                  {lesson.flow.map((s, i) => (
                    <li key={i} className="tutor__step">
                      <span className="tutor__step-n">{i + 1}</span>
                      <div>
                        <strong>{s.title}</strong>
                        {s.detail && <p>{s.detail}</p>}
                      </div>
                    </li>
                  ))}
                  {lesson.result && (
                    <li className="tutor__step tutor__step--result">
                      <span className="tutor__step-n">✓</span>
                      <div>
                        <strong>Result</strong>
                        <p>{lesson.result}</p>
                      </div>
                    </li>
                  )}
                </ol>
              ) : (
                <p className="tutor__empty">{tutor.emptyFlow}</p>
              )}
            </div>
          </section>

          {/* ask the tutor */}
          <form
            className="chat__form tutor__form chat__slide"
            style={{ '--d': '0.3s' }}
            onSubmit={handleTutorSend}
          >
            <AttachControl file={tutorAttached} onChange={setTutorAttached} />
            <input
              className="chat__input"
              type="text"
              value={tutorDraft}
              onChange={(e) => setTutorDraft(e.target.value)}
              placeholder={tutor.askPlaceholder}
              autoComplete="off"
              aria-label="Ask the tutor"
            />
            <button
              type="submit"
              className="chat__send"
              disabled={(!tutorDraft.trim() && !tutorAttached) || tutorWaiting}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="13 6 19 12 13 18" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* chibi: sits above the send button, hops for 3 seconds after each reply */}
      {tutor.chibi && (
        <div className={`chat__chibi ${chibiOn ? 'chat__chibi--on' : ''}`} aria-hidden="true">
          <video
            ref={videoRef}
            src={tutor.chibi}
            muted
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
          />
        </div>
      )}

      {/* blurs the character and chat while the menu is open (same layer as the session screen) */}
      <div className={`session__blur ${menuOpen ? 'session__blur--on' : ''}`} />

      {/* dropdown menu (uses the same styles as the session screen's menu) */}
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
          {/* Home: goes back to the main menu */}
          <button className="session__bar" style={{ '--i': 0 }} onClick={onHome}>
            <span className="session__circle">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 11.5 12 5l8 6.5" />
                <path d="M6.5 10v9h11v-9" />
              </svg>
            </span>
            <span className="session__bar-label">Home</span>
          </button>

          {/* Load Session: asks for a codename, then loads that chat history */}
          {onLoadSession && (
            <button className="session__bar" style={{ '--i': 1 }} onClick={openLoad}>
              <span className="session__circle">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4v10" />
                  <polyline points="8 10 12 14 16 10" />
                  <path d="M5 18h14" />
                </svg>
              </span>
              <span className="session__bar-label">Load Session</span>
            </button>
          )}

          {/* Tutoring Mode: switches the chat box for the code box and the flow box */}
          <button
            className="session__bar"
            style={{ '--i': onLoadSession ? 2 : 1 }}
            onClick={toggleTutor}
          >
            <span className="session__circle">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 9 12 5l9 4-9 4z" />
                <path d="M7 11v4c0 1 2.2 2 5 2s5-1 5-2v-4" />
              </svg>
            </span>
            <span className="session__bar-label">
              Tutoring Mode{mode === 'tutor' ? ' · On' : ''}
            </span>
          </button>
        </div>
      </div>

      {/* top and bottom panels: close, then open, while the screens are swapped */}
      {curtain !== 'off' && (
        <div
          className="chat__shutters"
          aria-hidden="true"
          style={{ '--shutter-ms': `${SHUTTER_MS}ms` }}
        >
          <div className={`chat__shutter chat__shutter--top chat__shutter--${curtain}`} />
          <div className={`chat__shutter chat__shutter--bottom chat__shutter--${curtain}`} />
        </div>
      )}

      {/* codename box for loading a session */}
      {loadOpen && <LoadPrompt onSubmit={onLoadSession} onClose={() => setLoadOpen(false)} />}
    </section>
  );
}